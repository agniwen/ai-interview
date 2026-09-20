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
      /^@app\/server\/ai-interview-report-recovery$/,
      /^@app\/server\/human-interview-evaluation-ready$/,
      /^@app\/server\/ai-interview-report-notification$/,
      /^@app\/server\/human-interview-attendance-reconciliation$/,
      /^@app\/server\/human-interview-recording$/,
      /^@app\/server\/human-transcription$/,
      /^@app\/server\/initial-interview-evaluation$/,
      /^@app\/server\/offer-approval-notifications$/,
      /^@app\/shared(?:\/|$)/,
    ],
    onlyBundle: false,
  },
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
});
