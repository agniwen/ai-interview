/**
 * 客户端可见的 API 流式协议类型。从 server agents 抽离出来，避免 client
 * 组件直接 import `@/server/...` 导致 server 模块被意外打进客户端 bundle。
 *
 * Client-facing API stream types extracted out of server agents so client
 * components don't need to reach into `@/server/...`. Importing the agent
 * module would risk pulling server-only runtime into the browser bundle.
 */

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

/**
 * 简历解析后落库的 superset 结构化字段。运行时 schema 在 server 侧
 * 用 zod 定义；这里只重新导出类型，确保 client 组件不需要 import 任何
 * 服务器路径，避免 server 模块被意外打进客户端 bundle。
 *
 * Type-only re-export of the parsed-resume superset shape. The runtime
 * Zod schema lives server-side; client components import the type from
 * here so no server path appears in their imports.
 */
export type { ResumeParserStructured } from "@/server/agents/resume-parser-schema";
