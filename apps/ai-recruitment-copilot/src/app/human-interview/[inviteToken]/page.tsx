import type { Metadata } from "next";
import { connection } from "next/server";
import type { PublicHumanInterviewMeetingPreview } from "@/lib/shared/studio-pipeline-stages";
import { HumanMeetingRoom } from "../_components/human-meeting-room";

export const metadata: Metadata = {
  title: "真人复面",
};

async function loadPreview(
  inviteToken: string,
): Promise<PublicHumanInterviewMeetingPreview | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  try {
    const response = await fetch(
      `${baseUrl}/api/public/human-interview-meetings/${encodeURIComponent(inviteToken)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PublicHumanInterviewMeetingPreview;
  } catch {
    return null;
  }
}

export default async function PublicHumanInterviewPage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  await connection();
  const { inviteToken } = await params;
  const preview = await loadPreview(inviteToken);

  if (!preview) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-muted-foreground text-sm">当前真人复面链接不可用。</p>
      </main>
    );
  }

  return <HumanMeetingRoom inviteToken={inviteToken} mode="candidate" preview={preview} />;
}
