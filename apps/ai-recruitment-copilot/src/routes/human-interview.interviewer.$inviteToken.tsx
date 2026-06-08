import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { PublicHumanInterviewInterviewerPreview } from "@arc/shared/studio-pipeline-stages";
import { HumanMeetingRoom } from "@/components/human-interview/human-meeting-room";

interface HumanInterviewInterviewerState {
  inviteToken: string;
  preview: PublicHumanInterviewInterviewerPreview | null;
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

const loadHumanInterviewInterviewerState = createServerFn({ method: "GET" })
  .validator((input: { inviteToken: string }) => input)
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
  component: PublicHumanInterviewInterviewerRoute,
  head: () => ({
    meta: [{ title: "真人复面会议" }],
  }),
  loader: ({ params }) =>
    loadHumanInterviewInterviewerState({ data: { inviteToken: params.inviteToken } }),
});
