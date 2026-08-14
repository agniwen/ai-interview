import { createFileRoute } from "@tanstack/react-router";
import Scorers from "@/components/features/mastra-studio/upstream/pages/scorers";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/scorers")({
  component: Scorers,
  staticData: { handle: navHandle("/scorers") },
});
