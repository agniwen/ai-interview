import { createFileRoute } from "@tanstack/react-router";
import Scorer from "@/components/features/mastra-studio/upstream/pages/scorers/scorer";
import { ScorerCrumb } from "@/components/features/mastra-studio/upstream/domains/scores/scorer-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/scorers_/$scorerId")({
  component: Scorer,
  staticData: {
    handle: navHandleWithChildren("/scorers", [
      { Component: ScorerCrumb, heading: "Scorer", id: "scorer" },
    ]),
  },
});
