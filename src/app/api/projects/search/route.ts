import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { likePattern } from "@/lib/project-select";
import { supabaseServer } from "@/lib/supabase-server";
import {
  EMPTY_PALETTE,
  type PaletteGroups,
  type PaletteRow,
} from "@/lib/palette-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof supabaseServer>;

const PER_GROUP = 5;
const MIN_CHARS = 2;
const MAX_CHARS = 100;
const TASK_KEY = /^([A-Za-z]{2,5})-(\d+)$/;

type ProjectInfo = { id: string; name: string; task_prefix: string };
type TaskHit = {
  id: string;
  project_id: string;
  number: number;
  title: string;
};
type MeetingHit = { id: string; title: string; project_id: string | null };
type DecisionHit = {
  id: string;
  statement: string;
  meetings: MeetingHit | MeetingHit[] | null;
};

const one = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

async function readProjects(db: Db, userId: string): Promise<ProjectInfo[]> {
  const { data: members, error } = await db
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId)
    .is("removed_at", null);
  if (error) throw error;
  const ids = ((members ?? []) as Array<{ project_id: string }>).map(
    (m) => m.project_id,
  );
  if (ids.length === 0) return [];
  const { data, error: projectError } = await db
    .from("projects")
    .select("id, name, task_prefix")
    .in("id", ids);
  if (projectError) throw projectError;
  return (data ?? []) as ProjectInfo[];
}

async function readTasks(
  db: Db,
  projects: ProjectInfo[],
  q: string,
  pattern: string,
): Promise<TaskHit[]> {
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const byTitle = db
    .from("tasks")
    .select("id, project_id, number, title")
    .in("project_id", ids)
    .ilike("title", pattern)
    .order("updated_at", { ascending: false })
    .limit(PER_GROUP);
  const key = TASK_KEY.exec(q);
  const owner = key
    ? projects.find((p) => p.task_prefix.toLowerCase() === key[1].toLowerCase())
    : undefined;
  const [titleHits, keyHits] = await Promise.all([
    byTitle,
    owner && key
      ? db
          .from("tasks")
          .select("id, project_id, number, title")
          .eq("project_id", owner.id)
          .eq("number", Number(key[2]))
          .limit(1)
      : Promise.resolve({ data: [] as TaskHit[], error: null }),
  ]);
  if (titleHits.error) throw titleHits.error;
  if (keyHits.error) throw keyHits.error;
  const merged = new Map<string, TaskHit>();
  for (const hit of [
    ...((keyHits.data ?? []) as TaskHit[]),
    ...((titleHits.data ?? []) as TaskHit[]),
  ])
    merged.set(hit.id, hit);
  return [...merged.values()].slice(0, PER_GROUP);
}

// Your active projects plus the personal meetings you created, never anyone else's.
async function readMeetings(
  db: Db,
  userId: string,
  projectIds: string[],
  pattern: string,
): Promise<MeetingHit[]> {
  const base = () =>
    db.from("meetings").select("id, title, project_id").ilike("title", pattern);
  const [personal, project] = await Promise.all([
    base()
      .eq("user_id", userId)
      .is("project_id", null)
      .order("created_at", { ascending: false })
      .limit(PER_GROUP),
    projectIds.length > 0
      ? base()
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
          .limit(PER_GROUP)
      : Promise.resolve({ data: [] as MeetingHit[], error: null }),
  ]);
  if (personal.error) throw personal.error;
  if (project.error) throw project.error;
  return [
    ...((personal.data ?? []) as MeetingHit[]),
    ...((project.data ?? []) as MeetingHit[]),
  ].slice(0, PER_GROUP);
}

// Decisions match the statement only, never the quote (AC-78b).
async function readDecisions(
  db: Db,
  userId: string,
  projectIds: string[],
  pattern: string,
): Promise<DecisionHit[]> {
  const base = () =>
    db
      .from("ledger_items")
      .select("id, statement, meetings!inner(id, title, project_id)")
      .eq("kind", "decision")
      .ilike("statement", pattern)
      .order("created_at", { ascending: false })
      .limit(PER_GROUP);
  const [personal, project] = await Promise.all([
    base().is("meetings.project_id", null).eq("meetings.user_id", userId),
    projectIds.length > 0
      ? base().in("meetings.project_id", projectIds)
      : Promise.resolve({ data: [] as DecisionHit[], error: null }),
  ]);
  if (personal.error) throw personal.error;
  if (project.error) throw project.error;
  return [
    ...((personal.data ?? []) as unknown as DecisionHit[]),
    ...((project.data ?? []) as unknown as DecisionHit[]),
  ].slice(0, PER_GROUP);
}

function toGroups(
  projects: ProjectInfo[],
  q: string,
  tasks: TaskHit[],
  meetings: MeetingHit[],
  decisions: DecisionHit[],
): PaletteGroups {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const lower = q.toLowerCase();
  const projectRows: PaletteRow[] = projects
    .filter((p) => p.name.toLowerCase().includes(lower))
    .slice(0, PER_GROUP)
    .map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.task_prefix,
      href: `/projects/${p.id}`,
    }));
  const taskRows: PaletteRow[] = tasks.flatMap((t) => {
    const project = byId.get(t.project_id);
    if (!project) return [];
    return [
      {
        id: t.id,
        title: t.title,
        subtitle: `${project.task_prefix}-${t.number} · ${project.name}`,
        href: `/projects/${t.project_id}?tab=tasks&task=${t.id}`,
      },
    ];
  });
  const meetingRows: PaletteRow[] = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    subtitle:
      (m.project_id && byId.get(m.project_id)?.name) || "Personal meeting",
    href: `/meeting-intelligence/${m.id}`,
  }));
  const decisionRows: PaletteRow[] = decisions.flatMap((d) => {
    const meeting = one(d.meetings);
    if (!meeting) return [];
    const projectId = meeting.project_id;
    return [
      {
        id: d.id,
        title: d.statement,
        subtitle: meeting.title,
        href: projectId
          ? `/projects/${projectId}?tab=promises&meetingId=${meeting.id}`
          : `/meeting-intelligence/${meeting.id}`,
      },
    ];
  });
  return {
    projects: projectRows,
    tasks: taskRows,
    meetings: meetingRows,
    decisions: decisionRows,
  };
}

// Ctrl K palette: title, key, and statement text only, never embeddings (AC-78).
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json(
      { error: "Unauthorized", ...EMPTY_PALETTE },
      { status: 401 },
    );

  const q = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_CHARS);
  if (q.length < MIN_CHARS) return NextResponse.json(EMPTY_PALETTE);

  try {
    const db = supabaseServer();
    const projects = await readProjects(db, userId);
    const projectIds = projects.map((p) => p.id);
    const pattern = likePattern(q);
    const [tasks, meetings, decisions] = await Promise.all([
      readTasks(db, projects, q, pattern),
      readMeetings(db, userId, projectIds, pattern),
      readDecisions(db, userId, projectIds, pattern),
    ]);
    return NextResponse.json(toGroups(projects, q, tasks, meetings, decisions));
  } catch (err) {
    console.error("Palette search failed:", err);
    return NextResponse.json(
      { error: "Search failed", ...EMPTY_PALETTE },
      { status: 500 },
    );
  }
}
