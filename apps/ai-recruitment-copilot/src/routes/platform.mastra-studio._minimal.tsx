import { createFileRoute } from "@tanstack/react-router";
import { MastraStudioMinimalLayout } from "@/components/features/mastra-studio/router/studio-route-layouts";

export const Route = createFileRoute("/platform/mastra-studio/_minimal")({
  component: MastraStudioMinimalLayout,
});
