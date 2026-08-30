import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/^@arc\//],
    onlyBundle: false,
  },
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
});
