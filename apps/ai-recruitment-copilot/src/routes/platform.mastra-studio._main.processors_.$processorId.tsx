import { createFileRoute } from "@tanstack/react-router";
import { Processor } from "@/components/features/mastra-studio/upstream/pages/processors/processor";
import { ProcessorCrumb } from "@/components/features/mastra-studio/upstream/domains/processors/processor-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/processors_/$processorId")({
  component: Processor,
  staticData: {
    handle: navHandleWithChildren("/processors", [
      { Component: ProcessorCrumb, heading: "Processor", id: "processor" },
    ]),
  },
});
