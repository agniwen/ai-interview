import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [
      /^@app\/db-schema(?:\/|$)/,
      /^@app\/meeting-live-transcript(?:\/|$)/,
      /^@app\/meeting-processing-queue(?:\/|$)/,
      /^@app\/resume-parse-queue(?:\/|$)/,
      /^@app\/shared(?:\/|$)/,
    ],
    onlyBundle: false,
  },
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
});
