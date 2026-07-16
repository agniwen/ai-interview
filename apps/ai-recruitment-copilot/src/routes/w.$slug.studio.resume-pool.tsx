import { createFileRoute } from "@tanstack/react-router";

import { ResumePoolPage } from "@/components/features/studio/resume-pool/resume-pool-page";
import type { ResumePoolSearch } from "@/components/features/studio/resume-pool/resume-pool-page";
import {
  normalizeResumePoolUploaderId,
  normalizeScope,
} from "@/components/features/studio/resume-pool/resume-pool-page-model";
import { ResumePoolPageSkeleton } from "@/components/features/studio/studio-page-skeletons";

export const Route = createFileRoute("/w/$slug/studio/resume-pool")({
  component: ResumePoolPage,
  head: () => ({
    meta: [{ title: "人才库" }],
  }),
  pendingComponent: ResumePoolPageSkeleton,
  validateSearch: (search: Record<string, unknown>): ResumePoolSearch => ({
    scope: normalizeScope(search.scope),
    uploaderId: normalizeResumePoolUploaderId(search.uploaderId),
  }),
});
