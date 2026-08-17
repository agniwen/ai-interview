import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@arc/ai-recruitment-copilot-backend/server/type";

interface InternalErrorResponseOptions {
  context?: object;
  error: unknown;
  operation: string;
  publicMessage: string;
}

interface InternalErrorResponse {
  error: string;
}

export function createInternalErrorResponse({
  context,
  error,
  operation,
  publicMessage,
}: InternalErrorResponseOptions): InternalErrorResponse {
  console.error(`[${operation}] failed`, { ...context, error });
  return { error: publicMessage };
}

// 顶层错误兜底：已声明的 HTTPException 按其原始状态码返回；其余未捕获异常打印完整堆栈，
// 并返回统一的 500 响应。各路由自己 try/catch 后 return c.json(...) 的行为不受影响——
// onError 只接那些漏到框架层的未捕获异常。
// Top-level error net: HTTPExceptions pass through with their status; any other
// uncaught error logs its full stack and returns a uniform 500. Routes that
// catch and return their own c.json(...) are unaffected — onError only sees
// errors that escaped to the framework layer.
export const handleServerError: ErrorHandler<Env> = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
};
