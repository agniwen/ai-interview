import { createFileRoute } from "@tanstack/react-router";
import Logs from "@/components/features/mastra-studio/upstream/pages/logs";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/logs")({
  component: Logs,
  staticData: { handle: navHandle("/logs") },
});
