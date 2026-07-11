import { createFileRoute } from "@tanstack/react-router";

import { ResumePoolPage } from "@/components/features/studio/resume-pool/resume-pool-page";
import type { ResumePoolSearch } from "@/components/features/studio/resume-pool/resume-pool-page";
import { normalizeScope } from "@/components/features/studio/resume-pool/resume-pool-page-model";

export const Route = createFileRoute("/w/$slug/studio/resume-pool")({
  component: ResumePoolPage,
  head: () => ({
    meta: [{ title: "人才库" }],
  }),
  validateSearch: (search: Record<string, unknown>): ResumePoolSearch => ({
    scope: normalizeScope(search.scope),
  }),
});
