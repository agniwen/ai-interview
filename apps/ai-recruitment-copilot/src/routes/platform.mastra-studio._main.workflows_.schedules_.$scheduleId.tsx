import { createFileRoute } from "@tanstack/react-router";
import SchedulePage from "@/components/features/mastra-studio/upstream/pages/workflows/schedule";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/workflows_/schedules_/$scheduleId",
)({
  component: SchedulePage,
  staticData: { handle: navHandle("/workflows") },
});
