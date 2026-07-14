import { createFileRoute } from "@tanstack/react-router";
import CmsScorersCreatePage from "@/components/features/mastra-studio/upstream/pages/cms/scorers/create";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/cms/scorers/create")({
  component: CmsScorersCreatePage,
  staticData: {
    handle: navHandleWithChildren("/scorers", [{ id: "create-scorer", label: "Create scorer" }]),
  },
});
