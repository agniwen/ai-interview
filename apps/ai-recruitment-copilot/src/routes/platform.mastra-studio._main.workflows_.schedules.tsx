import { createFileRoute } from "@tanstack/react-router";
import SchedulesPage from "@/components/features/mastra-studio/upstream/pages/workflows/schedules";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/workflows_/schedules")({
  component: SchedulesPage,
  staticData: { handle: navHandle("/workflows") },
});
