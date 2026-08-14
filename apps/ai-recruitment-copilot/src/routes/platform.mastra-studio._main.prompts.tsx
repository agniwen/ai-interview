import { createFileRoute } from "@tanstack/react-router";
import PromptBlocks from "@/components/features/mastra-studio/upstream/pages/prompt-blocks";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/prompts")({
  component: PromptBlocks,
  staticData: { handle: navHandle("/prompts") },
});
