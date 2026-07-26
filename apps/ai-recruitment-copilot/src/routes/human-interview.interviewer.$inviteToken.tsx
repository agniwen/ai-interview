import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { PublicHumanInterviewInterviewerPreview } from "@arc/shared/studio-pipeline-stages";
import { HumanMeetingRoom } from "@/components/features/human-interview/human-meeting-room";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

interface HumanInterviewInterviewerState {
  inviteToken: string;
  preview: PublicHumanInterviewInterviewerPreview | null;
}

function getBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_BASE_URL is not configured.");
  }
  return baseUrl;
}

const loadHumanInterviewInterviewerState = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<HumanInterviewInterviewerState> => {
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/public/human-interview-meetings/interviewer/${encodeURIComponent(
          data.inviteToken,
        )}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { inviteToken: data.inviteToken, preview: null };
      }
      return {
        inviteToken: data.inviteToken,
        preview: (await response.json()) as PublicHumanInterviewInterviewerPreview,
      };
    } catch {
      return { inviteToken: data.inviteToken, preview: null };
    }
  });

function PublicHumanInterviewInterviewerRoute() {
  const { inviteToken, preview } = useLoaderData({
    from: "/human-interview/interviewer/$inviteToken",
  });

  if (!preview) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-muted-foreground text-sm">当前真人复面链接不可用。</p>
      </main>
    );
  }

  return <HumanMeetingRoom inviteToken={inviteToken} mode="interviewer" preview={preview} />;
}

export const Route = createFileRoute("/human-interview/interviewer/$inviteToken")({
  loader: ({ params }) =>
    loadHumanInterviewInterviewerState({ data: { inviteToken: params.inviteToken } }),
  head: () => ({
    meta: [{ title: formatDocumentTitle("真人复面会议") }],
  }),
  component: PublicHumanInterviewInterviewerRoute,
});
