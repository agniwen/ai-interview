import { createFileRoute } from "@tanstack/react-router";
import DatasetItemPage from "@/components/features/mastra-studio/upstream/pages/datasets/dataset/item";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/datasets_/$datasetId_/items_/$itemId",
)({
  component: DatasetItemPage,
  staticData: { handle: navHandle("/datasets") },
});
