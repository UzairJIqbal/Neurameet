import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The stored toggles. A missing row means both are on (AC-75). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data, error } = await supabaseServer()
      .from("user_settings")
      .select("email_notifications, digest_emails")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      emailNotifications: data?.email_notifications ?? true,
      digestEmails: data?.digest_emails ?? true,
    });
  } catch (err) {
    console.error("[settings] notifications read failed:", err);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 },
    );
  }
}

/** The server copy of the toggles, read by notify and the digest (AC-75). */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  const { emailNotifications, digestEmails } = body as Record<string, unknown>;
  const invalid = [emailNotifications, digestEmails].some(
    (v) => v !== undefined && typeof v !== "boolean",
  );
  if (
    invalid ||
    (emailNotifications === undefined && digestEmails === undefined)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  try {
    const { error } = await supabaseServer()
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          ...(emailNotifications !== undefined && {
            email_notifications: emailNotifications,
          }),
          ...(digestEmails !== undefined && { digest_emails: digestEmails }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[settings] notifications write failed:", err);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
