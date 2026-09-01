import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { PublicHumanInterviewMeetingPreview } from "@arc/shared/studio-pipeline-stages";
import { humanInterviewMeetingStatusSchema } from "@arc/db-schema/studio-interviews";
import { candidateInterviewInvitationStatusSchema } from "@arc/db-schema/interview-notifications";
import { z } from "zod";
import { HumanMeetingRoom } from "@/components/features/human-interview/human-meeting-room";
import { backendApiUrl } from "@/lib/client/backend-api";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

interface HumanInterviewCandidateState {
  errorMessage: string | null;
  inviteToken: string;
  preview: PublicHumanInterviewMeetingPreview | null;
}

const candidatePreviewSchema = z.object({
  candidateInviteStatus: candidateInterviewInvitationStatusSchema,
  candidateName: z.string(),
  meetingId: z.string(),
  roundLabel: z.string(),
  scheduledAt: z.string().nullable(),
  status: humanInterviewMeetingStatusSchema,
  title: z.string(),
  validUntil: z.string().nullable(),
});

const loadHumanInterviewCandidateState = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<HumanInterviewCandidateState> => {
    try {
      const response = await fetch(
        backendApiUrl(`/public/human-interview-meetings/${encodeURIComponent(data.inviteToken)}`),
        { cache: "no-store" },
      );
      if (!response.ok) {
        return {
          errorMessage:
            response.status === 410
              ? "当前真人复面邀请已过期，请联系招聘负责人重新发送邀请。"
              : "当前真人复面链接不可用。",
          inviteToken: data.inviteToken,
          preview: null,
        };
      }
      const parsed = candidatePreviewSchema.safeParse(await response.json());
      return {
        errorMessage: parsed.success ? null : "当前真人复面链接不可用。",
        inviteToken: data.inviteToken,
        preview: parsed.success ? parsed.data : null,
      };
    } catch {
      return {
        errorMessage: "当前真人复面链接不可用。",
        inviteToken: data.inviteToken,
        preview: null,
      };
    }
  });

function PublicHumanInterviewRoute() {
  const { errorMessage, inviteToken, preview } = useLoaderData({
    from: "/human-interview/$inviteToken",
  });

  if (!preview) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-muted-foreground text-sm">{errorMessage}</p>
      </main>
    );
  }

  return <HumanMeetingRoom inviteToken={inviteToken} mode="candidate" preview={preview} />;
}

export const Route = createFileRoute("/human-interview/$inviteToken")({
  loader: ({ params }) =>
    loadHumanInterviewCandidateState({ data: { inviteToken: params.inviteToken } }),
  head: () => ({
    meta: [{ title: formatDocumentTitle("真人复面") }],
  }),
  component: PublicHumanInterviewRoute,
});
