import { createFileRoute } from "@tanstack/react-router";
import Datasets from "@/components/features/mastra-studio/upstream/pages/datasets";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/datasets")({
  component: Datasets,
  staticData: { handle: navHandle("/datasets") },
});
