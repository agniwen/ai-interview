import { createFileRoute } from "@tanstack/react-router";
import { MastraStudioMainLayout } from "@/components/features/mastra-studio/router/studio-route-layouts";

export const Route = createFileRoute("/platform/mastra-studio/_main")({
  component: MastraStudioMainLayout,
});
