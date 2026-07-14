import { createFileRoute } from "@tanstack/react-router";
import Agents from "@/components/features/mastra-studio/upstream/pages/agents";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents")({
  component: Agents,
  staticData: { handle: navHandle("/agents") },
});
