import { createFileRoute } from "@tanstack/react-router";
import { SignUp } from "@/components/features/mastra-studio/upstream/pages/signup";

export const Route = createFileRoute("/platform/mastra-studio/_minimal/signup")({
  component: SignUp,
});
