import { defineConfig } from "oxlint";

import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    "apps/ai-interview/src/components/agents-ui/**",
    "apps/ai-interview/src/hooks/agents-ui/**",
    "apps/ai-interview/src/components/ui/**",
    "apps/ai-interview/src/components/react-bits/**",
  ],
  rules: {
    "func-style": "off",
  },
});
