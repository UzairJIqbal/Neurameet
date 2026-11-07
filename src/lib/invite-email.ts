import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendProjectInviteEmail, workspaceEmailConfigured } from "@/lib/email";
import { sendInviteEmailWithinBudget } from "@/lib/invitations";
import { lookupProfiles } from "@/lib/projects";
import { ROLE_LABELS, type InviteRole } from "@/lib/project-types";

// The shared send for a new invite and a resend. Same daily budget, and false
// when email is off, so the caller can offer the copy link fallback.
export async function emailInvite(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    invitationId: string;
    actorId: string;
    to: string;
    role: InviteRole;
    link: string;
  },
): Promise<boolean> {
  return sendInviteEmailWithinBudget(supabase, workspaceEmailConfigured(), {
    projectId: input.projectId,
    invitationId: input.invitationId,
    actorId: input.actorId,
    send: async () => {
      const [{ data: project }, profiles] = await Promise.all([
        supabase
          .from("projects")
          .select("name")
          .eq("id", input.projectId)
          .maybeSingle(),
        lookupProfiles([input.actorId]),
      ]);
      return sendProjectInviteEmail({
        to: input.to,
        projectName: (project as { name?: string } | null)?.name ?? "a project",
        inviterName: profiles.get(input.actorId)?.name ?? "A teammate",
        roleLabel: ROLE_LABELS[input.role],
        link: input.link,
      });
    },
  });
}
