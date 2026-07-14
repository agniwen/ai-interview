import { createFileRoute } from "@tanstack/react-router";
import TraceDetails from "@/components/features/mastra-studio/upstream/pages/traces/trace";
import { TraceCrumb } from "@/components/features/mastra-studio/upstream/domains/traces/trace-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/traces/$traceId")({
  component: TraceDetails,
  staticData: {
    handle: navHandleWithChildren("/observability", [
      { Component: TraceCrumb, heading: "Trace", id: "trace" },
    ]),
  },
});
