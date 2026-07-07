import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "@arc/ai-recruitment-copilot-backend/server/type";
import { handleServerError } from "./error-handler";

describe("handleServerError", () => {
  it("尊重 HTTPException 的原状态码，不当 500", async () => {
    const app = new Hono<Env>().onError(handleServerError);
    app.get("/boom", () => {
      throw new HTTPException(409, { message: "冲突" });
    });

    const res = await app.request("/boom");

    expect(res.status).toBe(409);
  });

  it("未捕获异常返回统一 500 JSON 并打印堆栈", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // 静默：避免测试输出里混入预期中的堆栈
    });
    const app = new Hono<Env>().onError(handleServerError);
    app.get("/boom", () => {
      throw new Error("kaboom");
    });

    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
