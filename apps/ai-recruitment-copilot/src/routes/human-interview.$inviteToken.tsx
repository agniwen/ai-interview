import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { PublicHumanInterviewMeetingPreview } from "@arc/shared/studio-pipeline-stages";
import { HumanMeetingRoom } from "@/components/features/human-interview/human-meeting-room";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

interface HumanInterviewCandidateState {
  inviteToken: string;
  preview: PublicHumanInterviewMeetingPreview | null;
}

function getBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_BASE_URL is not configured.");
  }
  return baseUrl;
}

const loadHumanInterviewCandidateState = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<HumanInterviewCandidateState> => {
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/public/human-interview-meetings/${encodeURIComponent(
          data.inviteToken,
        )}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { inviteToken: data.inviteToken, preview: null };
      }
      return {
        inviteToken: data.inviteToken,
        preview: (await response.json()) as PublicHumanInterviewMeetingPreview,
      };
    } catch {
      return { inviteToken: data.inviteToken, preview: null };
    }
  });

function PublicHumanInterviewRoute() {
  const { inviteToken, preview } = useLoaderData({ from: "/human-interview/$inviteToken" });

  if (!preview) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-muted-foreground text-sm">当前真人复面链接不可用。</p>
      </main>
    );
  }

  return <HumanMeetingRoom inviteToken={inviteToken} mode="candidate" preview={preview} />;
}

export const Route = createFileRoute("/human-interview/$inviteToken")({
  component: PublicHumanInterviewRoute,
  head: () => ({
    meta: [{ title: "真人复面" }],
  }),
  loader: ({ params }) =>
    loadHumanInterviewCandidateState({ data: { inviteToken: params.inviteToken } }),
});
