import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attributedLineIds,
  canRecordView,
  labelKey,
  linesFromLabel,
  listSpeakerLabels,
  sealBlocker,
} from "@/agent/minutes";
import {
  verifyPath,
  type MinutesAnswer,
  type MinutesReviewLine,
  type MinutesReviewState,
  type MinutesSealView,
  type MinutesSpeaker,
} from "@/lib/minutes-types";
import {
  loadRawText,
  loadReviewRows,
  loadSuggestions,
  toAttesterRef,
  toClaimRef,
  toLineRef,
  type ReviewRow,
  type ReviewRows,
} from "@/lib/minutes-review";

// Tasdeeq, Verified Minutes (spec 0003, AC-8 to AC-13, AC-20). The review state
// GET /api/minutes returns to an attester. Attribution is computed here, at
// read time, and never stored (AC-9).

function buildSpeakers(
  rows: ReviewRows,
  rawText: string,
  myName: string,
): MinutesSpeaker[] {
  const names = new Map(rows.attesters.map((a) => [a.user_id, a.display_name]));
  const lineRefs = rows.lines.map(toLineRef);
  const myKey = labelKey(myName);
  return listSpeakerLabels(rawText).map(({ key, label }) => {
    const claim = rows.claims.find((c) => c.speaker_label === key) ?? null;
    const fromLabel = claim
      ? new Set(linesFromLabel(lineRefs, key))
      : new Set<string>();
    const locked =
      claim !== null &&
      rows.attestations.some(
        (a) => a.user_id === claim.user_id && fromLabel.has(a.line_id),
      );
    return {
      key,
      label: claim?.display_label ?? label,
      holderId: claim?.user_id ?? null,
      holderName: claim ? (names.get(claim.user_id) ?? null) : null,
      claimedBy: claim?.claimed_by ?? null,
      locked,
      suggested: claim === null && key === myKey,
    };
  });
}

function buildLines(
  rows: ReviewRows,
  rawText: string,
  userId: string,
): MinutesReviewLine[] {
  const transcriptLines = rawText.split(/\r?\n/u);
  const names = new Map(rows.attesters.map((a) => [a.user_id, a.display_name]));
  const mine = new Set(
    attributedLineIds(
      rows.lines.map(toLineRef),
      rows.attesters.map(toAttesterRef),
      rows.claims.map(toClaimRef),
      userId,
    ),
  );
  return rows.lines.map((line) => {
    const answers: MinutesAnswer[] = rows.attestations
      .filter((a) => a.line_id === line.id)
      .map((a) => ({
        userId: a.user_id,
        displayName: names.get(a.user_id) ?? "Attendee",
        action: a.action,
        note: a.note,
        late: a.late,
      }));
    const isMine = mine.has(line.id);
    return {
      id: line.id,
      position: line.position,
      section: line.section,
      text: line.text,
      evidence: (line.evidence ?? []).map((e) => ({
        ...e,
        lineText: transcriptLines[e.lineNumber - 1]?.trim() || null,
      })),
      supported: line.supported,
      speakerLabels: line.speaker_labels ?? [],
      assignee: line.assignee,
      mine: isMine,
      canView: canRecordView(toLineRef(line), isMine),
      myAnswer: answers.find((a) => a.userId === userId) ?? null,
      answers,
    };
  });
}

async function loadSealView(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<MinutesSealView | null> {
  const { data, error } = await supabase
    .from("minutes_seals")
    .select("id, content_sha256, status_text, sealed_at")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const seal = data as {
    id: string;
    content_sha256: string;
    status_text: string;
    sealed_at: string;
  };
  return {
    id: seal.id,
    hash: seal.content_sha256,
    statusText: seal.status_text,
    sealedAt: seal.sealed_at,
    verifyPath: verifyPath(seal.id),
  };
}

/** Null when the caller is not a frozen attester (the route answers 404). */
export async function buildReviewState(
  supabase: SupabaseClient,
  meetingId: string,
  review: ReviewRow,
  userId: string,
  now: Date = new Date(),
): Promise<MinutesReviewState | null> {
  const rows = await loadReviewRows(supabase, review.id);
  const me = rows.attesters.find((a) => a.user_id === userId);
  if (!me) return null;

  const [rawText, suggestions, seal] = await Promise.all([
    loadRawText(supabase, meetingId),
    loadSuggestions(supabase, review.id),
    review.status === "sealed"
      ? loadSealView(supabase, review.id)
      : Promise.resolve(null),
  ]);

  const myKeys = new Set(
    rows.claims.filter((c) => c.user_id === userId).map((c) => c.speaker_label),
  );
  const attesterRefs = rows.attesters.map(toAttesterRef);
  // Owner first, then by name, so the progress list reads the same for everyone.
  const attesters = [...rows.attesters]
    .sort(
      (a, b) =>
        Number(b.is_owner) - Number(a.is_owner) ||
        a.display_name.localeCompare(b.display_name),
    )
    .map((a) => ({
      userId: a.user_id,
      displayName: a.display_name,
      isOwner: a.is_owner,
      done: a.done_at !== null,
    }));

  return {
    state: "review",
    status: review.status,
    reviewId: review.id,
    isOwner: me.is_owner,
    myUserId: userId,
    deadlineAt: review.deadline_at,
    deadlineDays: review.deadline_days,
    coverageText: review.coverage.text,
    transcriptSource: review.transcript_source,
    lines: buildLines(rows, rawText, userId),
    speakers: buildSpeakers(rows, rawText, me.display_name),
    attesters,
    mySuggestions: suggestions
      .filter((s) => myKeys.has(labelKey(s.speaker_label)))
      .sort((a, b) => a.line_number - b.line_number)
      .map((s) => ({
        id: s.id,
        speakerLabel: s.speaker_label,
        topic: s.topic,
        position: s.position,
        quote: s.quote,
        lineNumber: s.line_number,
        relatedLineId: s.related_line_id,
        status: s.status,
      })),
    progress: {
      done: attesters.filter((a) => a.done).length,
      total: attesters.length,
    },
    myDoneAt: me.done_at,
    sealBlocker:
      me.is_owner && review.status === "open"
        ? sealBlocker(attesterRefs, review.deadline_at, now)
        : null,
    seal,
  };
}
