import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  extends: [ultracite],
  ignorePatterns: [
    "apps/backend/dist/**",
    "apps/web/src/routeTree.gen.ts",
    ".agents/skills/transitions-dev/**",
    ".agents/skills/transitions-polish/**",
  ],
});
