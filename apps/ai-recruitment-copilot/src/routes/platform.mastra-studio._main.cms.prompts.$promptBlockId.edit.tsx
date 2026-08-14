import { createFileRoute } from "@tanstack/react-router";
import CmsPromptBlocksEditPage from "@/components/features/mastra-studio/upstream/pages/cms/prompt-blocks/edit";
import { PromptBlockCrumb } from "@/components/features/mastra-studio/upstream/domains/prompt-blocks/prompt-block-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/prompts/$promptBlockId/edit",
)({
  component: CmsPromptBlocksEditPage,
  staticData: {
    handle: navHandleWithChildren("/prompts", [
      { Component: PromptBlockCrumb, heading: "Prompt block", id: "prompt-block" },
    ]),
  },
});
