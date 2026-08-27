import { defineConfig } from "oxlint";

import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  // Keep the React Compiler rules at their upstream severities: its diagnostics
  // are warnings, while explicit project rules remain errors.
  extends: [core, react, next],
  ignorePatterns: [
    ".agents/**",
    ".claude/**",
    ".codex/**",
    "**/src/components/agents-ui/**",
    "**/src/hooks/agents-ui/**",
    "**/src/components/ui/**",
    "**/src/components/react-bits/**",
    "**/src/components/reui/**",
    "**/src/components/spell-ui/**",
    "apps/ai-recruitment-copilot/src/routeTree.gen.ts",
    "apps/ai-recruitment-copilot-worker/dist/**",
    "tools/oxlint/anti-slop/**",
    // Upstream/shared shadcn-style UI — keep parity with web exclusions.
    "apps/ai-recruitment-copilot-desktop/src/renderer/src/components/ui/**",
  ],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
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
    {
      // Electron desktop does not enable React Compiler; its compiler diagnostics
      // would not describe code that actually passes through the transform.
      files: ["apps/ai-recruitment-copilot-desktop/**/*.{ts,tsx}"],
      rules: {
        "nextjs/no-html-link-for-pages": "off",
        "nextjs/no-img-element": "off",
        "react/globals": "off",
        "react/incompatible-library": "off",
        "react/preserve-manual-memoization": "off",
        "react/purity": "off",
        "react/refs": "off",
        "react/set-state-in-effect": "off",
      },
    },
    {
      // Tests are never compiled by the app's React Compiler transform.
      files: ["**/__tests__/**/*.{ts,tsx}", "**/__test__/**/*.{ts,tsx}"],
      rules: {
        "react/globals": "off",
      },
    },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "func-style": "off",
    "max-lines": [
      "error",
      {
        max: 800,
        skipBlankLines: false,
        skipComments: false,
      },
    ],
    "react-doctor/no-derived-state": "warn",
    "react-doctor/no-fetch-in-effect": "warn",
  },
});
