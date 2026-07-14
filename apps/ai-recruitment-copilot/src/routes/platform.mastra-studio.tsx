import { createFileRoute } from "@tanstack/react-router";
import { MastraStudioPage } from "@/components/features/platform/mastra-studio/mastra-studio-page";

export const Route = createFileRoute("/platform/mastra-studio")({
  component: MastraStudioPage,
  head: () => ({
    meta: [{ title: "平台 · Mastra Studio" }],
  }),
});
