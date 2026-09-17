import {
  backgroundCheckCollectionStatusSchema,
  backgroundCheckDraftInputSchema,
} from "@app/db-schema/background-check";
import type { PublicBackgroundCheckRecord } from "@app/shared/studio-pipeline-stages";
import { createFileRoute, useLoaderData, useParams } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PublicBackgroundCheckPage } from "@/components/features/background-check/public-background-check-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

const publicBackgroundCheckSchema = z.object({
  candidateName: z.string(),
  companyName: z.string(),
  draftData: backgroundCheckDraftInputSchema.nullable().optional(),
  draftSavedAt: z.string().nullable().optional(),
  jobName: z.string().nullable(),
  status: backgroundCheckCollectionStatusSchema,
});

const loadBackgroundCheck = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<PublicBackgroundCheckRecord | null> => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_BASE_URL is not configured.");
    }
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/public/background-checks/${encodeURIComponent(data.inviteToken)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return null;
      }
      const parsed = publicBackgroundCheckSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  });

function BackgroundCheckRoute() {
  const record = useLoaderData({ from: "/background-check/$token" });
  const { token } = useParams({ from: "/background-check/$token" });
  if (!record) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">当前背调链接不可用。</p>
      </main>
    );
  }
  return <PublicBackgroundCheckPage initialRecord={record} key={token} token={token} />;
}

export const Route = createFileRoute("/background-check/$token")({
  component: BackgroundCheckRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("背景调查信息采集") }] }),
  loader: ({ params }) => loadBackgroundCheck({ data: { inviteToken: params.token } }),
});
