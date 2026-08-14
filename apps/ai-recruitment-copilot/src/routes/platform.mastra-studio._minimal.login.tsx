import { createFileRoute } from "@tanstack/react-router";
import { Login } from "@/components/features/mastra-studio/upstream/pages/login";

export const Route = createFileRoute("/platform/mastra-studio/_minimal/login")({
  component: Login,
});
