import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [
      /^@app\/ai-runtime(?:\/|$)/,
      /^@app\/database(?:\/|$)/,
      /^@app\/db-schema(?:\/|$)/,
      /^@app\/feishu(?:\/|$)/,
      /^@app\/job-queues(?:\/|$)/,
      /^@app\/meeting-live-transcript(?:\/|$)/,
      /^@app\/meeting-media(?:\/|$)/,
      /^@app\/meeting-processing(?:\/|$)/,
      /^@app\/object-storage(?:\/|$)/,
      /^@app\/recruiting(?:\/|$)/,
      /^@app\/recruiting-workflows(?:\/|$)/,
      /^@app\/resume-processing(?:\/|$)/,
      /^@app\/shared(?:\/|$)/,
    ],
    onlyBundle: false,
  },
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
});
