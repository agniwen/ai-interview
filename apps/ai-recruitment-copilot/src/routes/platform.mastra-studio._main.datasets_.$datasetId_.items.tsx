import { createFileRoute } from "@tanstack/react-router";
import DatasetItemsComparePage from "@/components/features/mastra-studio/upstream/pages/datasets/dataset/item/compare";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/datasets_/$datasetId_/items")({
  component: DatasetItemsComparePage,
  staticData: { handle: navHandle("/datasets") },
});
