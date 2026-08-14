import { createFileRoute } from "@tanstack/react-router";
import DatasetPage from "@/components/features/mastra-studio/upstream/pages/datasets/dataset";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/datasets_/$datasetId")({
  component: DatasetPage,
  staticData: { handle: navHandle("/datasets") },
});
