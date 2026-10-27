import { createFileRoute } from "@tanstack/react-router";
import { QuestionBankLayout } from "@/components/features/studio/question-bank/question-bank-layout";
import { QuestionBankPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

export const Route = createFileRoute("/w/$slug/studio/question-bank")({
  loader: ({ parentMatchPromise }) =>
    requireStudioPagePermission(parentMatchPromise, "questionBank"),
  head: () => ({ meta: [{ title: formatDocumentTitle("面试题") }] }),
  component: QuestionBankLayout,
  pendingComponent: QuestionBankPageSkeleton,
  shouldReload: false,
});
