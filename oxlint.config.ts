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
    "apps/ai-recruitment-copilot-worker/dist/**",
  ],
  rules: {
    "func-style": "off",
  },
});
