// The recording consent notice for project meetings (spec 0004, child
// 0004-project-meetings, AC-26 and AC-29). Browser safe: the join screens and
// the server routes share these values.

export const CONSENT_NOTICE_VERSION = "w3-v1";
export const CONSENT_FRESH_MINUTES = 15;
export const CONSENT_REQUIRED_MESSAGE = "Please accept the recording notice";
export const CONSENT_REQUIRED_CODE = "consent_required";

// The same text in the member and guest flows. A guest is not a member, so
// the guest flow passes no name and reads "this project".
export function consentNoticeText(projectName?: string | null): string {
  const project = projectName?.trim()
    ? `"${projectName.trim()}"`
    : "this project";
  return (
    `This call is recorded and transcribed. The recording, transcript, summary, ` +
    `and tasks are kept in ${project} until an Owner or Admin deletes them. ` +
    `Project members with access can see them.`
  );
}

export type ConsentRow = {
  consented_at: string | null;
  notice_version: string | null;
};

// Fresh means the current notice version, ticked within the last 15 minutes.
export function isConsentFresh(
  row: ConsentRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row?.consented_at || row.notice_version !== CONSENT_NOTICE_VERSION) {
    return false;
  }
  const at = new Date(row.consented_at).getTime();
  if (Number.isNaN(at)) return false;
  const ageMs = now.getTime() - at;
  return ageMs >= -60_000 && ageMs <= CONSENT_FRESH_MINUTES * 60_000;
}
