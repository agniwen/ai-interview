import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { candidateInterviewInvitationStatusSchema } from "@arc/db-schema/interview-notifications";
import type { PublicAiInterviewInvitationPreview } from "@arc/shared/studio-pipeline-stages";
import { AiInterviewInvitationPage } from "@/components/features/interview/ai-interview-invitation-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

interface AiInterviewInvitationState {
  inviteToken: string;
  preview: PublicAiInterviewInvitationPreview | null;
}

const previewSchema = z.object({
  candidateName: z.string(),
  companyName: z.string(),
  expiresAt: z.string(),
  jobName: z.string().nullable(),
  roundName: z.string(),
  scheduledAt: z.string().nullable(),
  status: candidateInterviewInvitationStatusSchema,
});

function getBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_BASE_URL is not configured.");
  }
  return baseUrl;
}

const loadAiInterviewInvitation = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<AiInterviewInvitationState> => {
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/public/ai-interview-invitations/${encodeURIComponent(data.inviteToken)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { inviteToken: data.inviteToken, preview: null };
      }
      const parsed = previewSchema.safeParse(await response.json());
      return { inviteToken: data.inviteToken, preview: parsed.success ? parsed.data : null };
    } catch {
      return { inviteToken: data.inviteToken, preview: null };
    }
  });

function AiInterviewInviteRoute() {
  const { inviteToken, preview } = useLoaderData({ from: "/ai-interview-invite/$inviteToken" });
  if (!preview) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">当前 AI 面试邀请链接不可用。</p>
      </main>
    );
  }
  return <AiInterviewInvitationPage inviteToken={inviteToken} preview={preview} />;
}

export const Route = createFileRoute("/ai-interview-invite/$inviteToken")({
  component: AiInterviewInviteRoute,
  loader: ({ params }) => loadAiInterviewInvitation({ data: { inviteToken: params.inviteToken } }),
  head: () => ({ meta: [{ title: formatDocumentTitle("AI 面试邀请") }] }),
});
