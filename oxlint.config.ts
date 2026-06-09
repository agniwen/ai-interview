import { defineConfig } from "oxlint";

import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    "**/src/components/agents-ui/**",
    "**/src/hooks/agents-ui/**",
    "**/src/components/ui/**",
    "**/src/components/react-bits/**",
    "**/src/components/spell-ui/**",
    "apps/ai-recruitment-copilot/src/routeTree.gen.ts",
    "apps/ai-recruitment-copilot-worker/dist/**",
  ],
  overrides: [
    {
      files: ["apps/ai-recruitment-copilot/src/routes/**/*.{ts,tsx}"],
      rules: {
        "nextjs/no-head-element": "off",
      },
    },
    {
      files: ["apps/ai-recruitment-copilot/src/app/_components/home/footer.tsx"],
      rules: {
        "nextjs/no-html-link-for-pages": "off",
      },
    },
  ],
  rules: {
    "func-style": "off",
  },
});
