import { defineConfig } from "oxlint";

import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    "src/components/agents-ui/**",
    "src/hooks/agents-ui/**",
    "src/components/ui/**",
    "src/components/react-bits/**",
  ],
  rules: {
    "func-style": "off",
  },
});
