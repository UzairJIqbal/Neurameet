import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import {
  detailColumns,
  loadProjectFull,
  parseProjectDetails,
  PROJECT_COLUMNS,
  type ProjectRow,
} from "@/lib/project-cards";
import { parseProjectName } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

const SEALED = { error: "Sealed minutes can't be deleted" };

async function loadProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabaseServer()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProjectRow | null) ?? null;
}

// Any member: the project, your role, and its counts. A failed count is null.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { role } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.read,
    );
    const project = await loadProject(id);
    if (!project)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const detail = await loadProjectFull(supabase, project, role);
    return NextResponse.json({ project: detail });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] get failed:", err);
    return NextResponse.json(
      { error: "Failed to load project" },
      { status: 500 },
    );
  }
}

// Owner only: the name and details, each optional. The prefix is fixed.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.owner);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (body && "taskPrefix" in body) {
      return NextResponse.json(
        { error: "The prefix can't change after the project is created" },
        { status: 422 },
      );
    }
    const details = parseProjectDetails(body ?? {});
    if (!details.ok)
      return NextResponse.json({ error: details.error }, { status: 422 });
    const columns: Record<string, string | null> = detailColumns(details.value);

    // No detail to change means the name is what you sent, or it is missing.
    let name: string | undefined;
    if (body?.name !== undefined || Object.keys(columns).length === 0) {
      const parsed = parseProjectName(body?.name);
      if (!parsed.ok)
        return NextResponse.json({ error: parsed.error }, { status: 422 });
      name = parsed.name;
      columns.name = name;
    }

    const { error } = await supabase
      .from("projects")
      .update({ ...columns, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, name, ...details.value });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] update failed:", err);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}

// Owner only: delete the project and its meetings. Each meeting's rows go with
// it through the database cascade, the same path DELETE /api/meetings/[id] uses.
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.owner);
    const project = await loadProject(id);
    if (!project)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json().catch(() => null)) as {
      confirmName?: unknown;
    } | null;
    if (body?.confirmName !== project.name) {
      return NextResponse.json(
        { error: "Type the project name exactly to delete it" },
        { status: 422 },
      );
    }

    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id")
      .eq("project_id", id);
    if (meetingsError) throw meetingsError;
    const meetingIds = ((meetings ?? []) as { id: string }[]).map((m) => m.id);

    if (meetingIds.length > 0) {
      const { data: seals, error: sealError } = await supabase
        .from("minutes_seals")
        .select("id")
        .in("meeting_id", meetingIds)
        .limit(1);
      if (sealError) throw sealError;
      if (seals && seals.length > 0)
        return NextResponse.json(SEALED, { status: 409 });

      const { error: deleteMeetingsError } = await supabase
        .from("meetings")
        .delete()
        .eq("project_id", id);
      // A seal that landed after the pre check trips the foreign key restrict.
      if ((deleteMeetingsError as { code?: string } | null)?.code === "23503") {
        return NextResponse.json(SEALED, { status: 409 });
      }
      if (deleteMeetingsError) throw deleteMeetingsError;
    }

    const { error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    const { error: auditError } = await supabase.from("audit_log").insert({
      project_id: id,
      actor_id: userId,
      action: "project.deleted",
      target_type: "project",
      target_id: id,
      detail: { name: project.name, meetings: meetingIds.length },
    });
    if (auditError) console.error("[projects] audit write failed:", auditError);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] delete failed:", err);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
