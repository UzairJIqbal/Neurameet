import { FileText } from "lucide-react";
import { getMeetingRecap } from "@/lib/meeting-recap";
import AfterMeetingRecap from "@/components/meeting-intelligence/AfterMeetingRecap";

export default async function AfterMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recap = await getMeetingRecap(id);

  if (!recap) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-6 text-on-surface">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <FileText className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            Meeting not found.
          </p>
        </div>
      </main>
    );
  }

  return <AfterMeetingRecap recap={recap} />;
}
