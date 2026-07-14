import { createFileRoute } from "@tanstack/react-router";
import DatasetItemVersionsComparePage from "@/components/features/mastra-studio/upstream/pages/datasets/dataset/item/versions";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/datasets_/$datasetId_/items_/$itemId_/versions",
)({
  component: DatasetItemVersionsComparePage,
  staticData: { handle: navHandle("/datasets") },
});
