import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  extends: [ultracite],
  ignorePatterns: [
    "apps/ai-recruitment-copilot/src/routeTree.gen.ts",
    ".agents/skills/transitions-dev/**",
    ".agents/skills/transitions-polish/**",
  ],
});
