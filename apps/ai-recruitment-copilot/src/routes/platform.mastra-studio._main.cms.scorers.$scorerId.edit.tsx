import { createFileRoute } from "@tanstack/react-router";
import CmsScorersEditPage from "@/components/features/mastra-studio/upstream/pages/cms/scorers/edit";
import { StoredScorerCrumb } from "@/components/features/mastra-studio/upstream/domains/scores/scorer-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/cms/scorers/$scorerId/edit")({
  component: CmsScorersEditPage,
  staticData: {
    handle: navHandleWithChildren("/scorers", [
      { Component: StoredScorerCrumb, heading: "Scorer", id: "scorer" },
    ]),
  },
});
