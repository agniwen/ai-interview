import type { ToolMockReport } from "@mastra/client-js";

export const baseReport: ToolMockReport = {
  liveCalls: [{ args: { q: "mastra" }, toolName: "searchDocs" }],
  served: [{ args: { city: "Seattle" }, mockIndex: 0, toolName: "getWeather" }],
  unconsumed: [{ args: { city: "Paris" }, mockIndex: 1, toolName: "getWeather" }],
};

export const failureReport: ToolMockReport = {
  ...baseReport,
  failure: { args: { city: "Paris" }, code: "TOOL_MOCK_MISMATCH", toolName: "getWeather" },
  liveCalls: [],
  served: [],
  unconsumed: [{ args: { city: "Seattle" }, mockIndex: 0, toolName: "getWeather" }],
};

export const emptyReport: ToolMockReport = { liveCalls: [], served: [], unconsumed: [] };
