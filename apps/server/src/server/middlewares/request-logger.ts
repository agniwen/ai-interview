import { createMiddleware } from "hono/factory";

export function safeRequestPath(raw: string) {
  const path = new URL(raw, "http://local").pathname;
  return path
    .replaceAll(/(\/human-interview-meetings)\/(?!interviewer(?:\/|$))[^/]+/g, "$1/[redacted]")
    .replaceAll(/(\/human-interview-meetings\/(?:interviewer|candidate))\/[^/]+/g, "$1/[redacted]")
    .replaceAll(
      /\/(human-interview(?:-review)?|join|invite|human-meeting)\/[^/]+/g,
      "/$1/[redacted]",
    );
}

export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  try {
    await next();
  } finally {
    console.info("request", {
      durationMs: Math.round(performance.now() - start),
      method: c.req.method,
      path: safeRequestPath(c.req.url),
      status: c.res.status,
    });
  }
});
