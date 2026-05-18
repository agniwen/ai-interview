/**
 * 简历分析 / 面试题生成的 NDJSON 流事件。两类接口共享同一事件形状：
 *  - `/api/interview/parse-resume`
 *  - `/api/interview/generate-questions`
 *
 * NDJSON stream event for resume analysis & interview-question generation;
 * shared across `/api/interview/parse-resume` and
 * `/api/interview/generate-questions`.
 */
export type AnalysisStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool-start"; name: string }
  | { type: "tool-end"; name: string }
  | { type: "text-delta"; text: string }
  | { type: "step"; index: number }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };
