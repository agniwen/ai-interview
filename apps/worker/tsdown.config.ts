import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [
      /^@app\/database(?:\/|$)/,
      /^@app\/db-schema(?:\/|$)/,
      /^@app\/meeting-live-transcript(?:\/|$)/,
      /^@app\/meeting-processing(?:\/|$)/,
      /^@app\/meeting-processing-queue(?:\/|$)/,
      /^@app\/resume-parse-queue(?:\/|$)/,
      /^@app\/resume-processing(?:\/|$)/,
      /^@app\/shared(?:\/|$)/,
    ],
    onlyBundle: false,
  },
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
});
