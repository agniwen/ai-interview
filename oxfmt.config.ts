import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  extends: [ultracite],
  ignorePatterns: [
    "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/**",
    "apps/ai-recruitment-copilot/src/routeTree.gen.ts",
  ],
});
