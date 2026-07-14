import { createFileRoute } from "@tanstack/react-router";
import CmsPromptBlocksCreatePage from "@/components/features/mastra-studio/upstream/pages/cms/prompt-blocks/create";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/cms/prompts/create")({
  component: CmsPromptBlocksCreatePage,
  staticData: {
    handle: navHandleWithChildren("/prompts", [
      { id: "create-prompt-block", label: "Create prompt block" },
    ]),
  },
});
