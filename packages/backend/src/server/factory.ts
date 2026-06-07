import type { Env } from "@arc/backend/server/type";
import { createFactory } from "hono/factory";

export const factory = createFactory<Env>();

// 中文：zValidator 失败时的统一错误响应钩子。保留 { error: string } 形状以匹配
// 前端既有客户端的错误读取逻辑（payload.error）。
// English: Shared zValidator failure hook — preserves { error: string } shape
// so existing frontend error-handling (which reads payload.error) keeps working.
interface ZodValidationFailure {
  success: false;
  error: { issues: { message: string }[] };
}
interface JsonResponder {
  json: (body: unknown, status: 400) => Response;
}
export function jsonValidatorError(fallback: string) {
  return (result: { success: true } | ZodValidationFailure, c: JsonResponder) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? fallback }, 400);
    }
  };
}
