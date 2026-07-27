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
    "**/src/components/reui/**",
    "**/src/components/spell-ui/**",
    "apps/ai-recruitment-copilot/src/routeTree.gen.ts",
    "apps/ai-recruitment-copilot-worker/dist/**",
  ],
  overrides: [
    {
      files: ["packages/db-schema/src/schema.ts"],
      rules: {
        "max-lines": "off",
      },
    },
    {
      files: ["apps/ai-recruitment-copilot/src/routes/**/*.{ts,tsx}"],
      rules: {
        "nextjs/no-head-element": "off",
        // TanStack Router's option order is part of its type-inference chain.
        // React Doctor validates that order, so route objects must not be
        // alphabetized by Ultracite's global sort-keys rule.
        "sort-keys": "off",
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
    "max-lines": [
      "error",
      {
        max: 800,
        skipBlankLines: false,
        skipComments: false,
      },
    ],
  },
});
