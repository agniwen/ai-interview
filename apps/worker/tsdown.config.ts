import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [
      /^@app\/ai-runtime(?:\/|$)/,
      /^@app\/database(?:\/|$)/,
      /^@app\/db-schema(?:\/|$)/,
      /^@app\/meeting-live-transcript(?:\/|$)/,
      /^@app\/meeting-media(?:\/|$)/,
      /^@app\/meeting-processing(?:\/|$)/,
      /^@app\/meeting-processing-queue(?:\/|$)/,
      /^@app\/object-storage(?:\/|$)/,
      /^@app\/resume-parse-queue(?:\/|$)/,
      /^@app\/resume-processing(?:\/|$)/,
      /^@app\/server\/human-interview-evaluation-ready$/,
      /^@app\/server\/human-interview-recording$/,
      /^@app\/shared(?:\/|$)/,
    ],
    onlyBundle: false,
  },
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
});
