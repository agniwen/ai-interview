import { offerDraftStatusSchema } from "@app/db-schema/studio-interviews";
import type { PublicOfferRecord } from "@app/shared/studio-pipeline-stages";
import { createFileRoute, useLoaderData, useParams } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PublicOfferPage } from "@/components/features/offer/public-offer-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { inviteTokenInputSchema } from "@/lib/start/server-fn-validators";

const publicOfferSchema = z.object({
  baseSalary: z.number(),
  bonus: z.number().nullable(),
  candidateName: z.string(),
  companyName: z.string(),
  currency: z.string(),
  declineReason: z.string().nullable(),
  equity: z.string().nullable(),
  expiresAt: z.string().nullable(),
  joiningDate: z.string().nullable(),
  position: z.string(),
  publishedAt: z.string(),
  responseAt: z.string().nullable(),
  status: offerDraftStatusSchema,
});

const loadOffer = createServerFn({ method: "GET" })
  .validator(inviteTokenInputSchema)
  .handler(async ({ data }): Promise<PublicOfferRecord | null> => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_BASE_URL is not configured.");
    }
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/public/offers/${encodeURIComponent(data.inviteToken)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return null;
      }
      const parsed = publicOfferSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  });

function OfferRoute() {
  const offer = useLoaderData({ from: "/offer/$token" });
  const { token } = useParams({ from: "/offer/$token" });
  if (!offer) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">当前 Offer 链接不可用。</p>
      </main>
    );
  }
  return <PublicOfferPage initialOffer={offer} token={token} />;
}

export const Route = createFileRoute("/offer/$token")({
  component: OfferRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("Offer 确认") }] }),
  loader: ({ params }) => loadOffer({ data: { inviteToken: params.token } }),
});
