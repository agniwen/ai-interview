import { createFileRoute } from "@tanstack/react-router";
import Evaluation from "@/components/features/mastra-studio/upstream/pages/evaluation";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/evaluation")({
  component: Evaluation,
  staticData: { handle: navHandle("/evaluation") },
});
