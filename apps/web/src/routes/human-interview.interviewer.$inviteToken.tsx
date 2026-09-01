import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  humanInterviewMeetingInterviewerRoleSchema,
  humanInterviewMeetingStatusSchema,
} from "@arc/db-schema/studio-interviews";
import type { PublicHumanInterviewInterviewerPreview } from "@arc/shared/studio-pipeline-stages";
import { z } from "zod";
import { HumanMeetingRoom } from "@/components/features/human-interview/human-meeting-room";
import { backendApiUrl } from "@/lib/client/backend-api";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

interface HumanInterviewInterviewerState {
  inviteToken: string;
  preview: PublicHumanInterviewInterviewerPreview | null;
}

const interviewerPreviewSchema = z.object({
  candidateName: z.string(),
  interviewerName: z.string(),
  meetingId: z.string(),
  role: humanInterviewMeetingInterviewerRoleSchema,
  roundLabel: z.string(),
  scheduledAt: z.string().nullable(),
  status: humanInterviewMeetingStatusSchema,
  title: z.string(),
  validUntil: z.string().nullable(),
});

const loadHumanInterviewInterviewerState = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<HumanInterviewInterviewerState> => {
    try {
      const response = await fetch(
        backendApiUrl(
          `/public/human-interview-meetings/interviewer/${encodeURIComponent(data.inviteToken)}`,
        ),
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { inviteToken: data.inviteToken, preview: null };
      }
      const parsed = interviewerPreviewSchema.safeParse(await response.json());
      return { inviteToken: data.inviteToken, preview: parsed.success ? parsed.data : null };
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
