import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderFavorite from "@/components/features/mastra-studio/upstream/pages/agent-builder/favorite";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/favorite/")({
  component: AgentBuilderFavorite,
});
