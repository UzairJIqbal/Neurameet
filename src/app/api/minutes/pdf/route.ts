import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyUrlFor } from "@/lib/email";
import { fail, requireAttester } from "@/lib/minutes-review";
import type { SealBundle } from "@/lib/minutes-seal";
import { generateMinutesPdf, type MinutesPdfLine } from "@/lib/minutes-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003, AC-18). Any attester, after the seal.
// The PDF is drawn from the sealed bundle, so it shows exactly what was sealed.

function pdfLines(bundle: SealBundle): MinutesPdfLine[] {
  const names = new Map(bundle.attesters.map((a) => [a.userId, a.displayName]));
  return bundle.lines.map((line) => ({
    section: line.section,
    text: line.text,
    evidence: line.evidence,
    supported: line.supported,
    assignee: line.assignee,
    answers: bundle.attestations
      .filter((a) => a.lineId === line.id)
      .map((a) => ({
        displayName: names.get(a.userId) ?? "Attendee",
        action: a.action,
        note: a.note,
        late: a.late,
      })),
  }));
}

const fileName = (title: string): string =>
  `minutes-${
    title
      .replace(/[^a-z0-9]+/giu, "-")
      .replace(/^-|-$/gu, "")
      .toLowerCase() || "meeting"
  }.pdf`;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const meetingId = new URL(request.url).searchParams.get("meetingId");
  if (!meetingId) return fail(400, "meetingId is required");

  try {
    const supabase = supabaseServer();
    const access = await requireAttester(supabase, meetingId, userId);
    if (!access.ok) return access.response;
    if (access.review.status !== "sealed")
      return fail(409, "The minutes are not sealed yet");

    const { data, error } = await supabase
      .from("minutes_seals")
      .select("id, content_sha256, status_text, sealed_at, bundle")
      .eq("review_id", access.review.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(409, "The minutes are not sealed yet");
    const seal = data as {
      id: string;
      content_sha256: string;
      status_text: string;
      sealed_at: string;
      bundle: SealBundle;
    };

    const bytes = await generateMinutesPdf({
      title: seal.bundle.meeting.title,
      date: seal.bundle.meeting.date,
      coverageText: seal.bundle.coverageText,
      fromRecording: seal.bundle.transcript.source === "recording",
      statusText: seal.status_text,
      hash: seal.content_sha256,
      verifyUrl: verifyUrlFor(seal.id),
      sealedAt: seal.sealed_at,
      lines: pdfLines(seal.bundle),
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName(seal.bundle.meeting.title)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[tasdeeq] minutes pdf failed", { meetingId, err });
    return fail(500, "Could not build the PDF");
  }
}
