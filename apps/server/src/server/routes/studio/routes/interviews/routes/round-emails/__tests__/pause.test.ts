import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { createRoundEmailsRouter } from "../route";
import type { Env } from "../../../../../../../type";

it("blocks the legacy direct-send endpoint before any database or provider call", async () => {
  const sendEmail = vi.fn();
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("activeOrg", {
      createdAt: new Date(),
      id: "test",
      logo: null,
      metadata: null,
      name: "Test",
      slug: "test",
    });
    await next();
  });
  app.route(
    "/",
    createRoundEmailsRouter({
      buildSenderFromAddress: () => "unused@example.com",
      requirePermission: () => (_c, next) => next(),
      sendEmail,
    }),
  );
  const response = await app.request("/any-round/send", { method: "POST" });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "候选人面试邮件暂时停用，请复制面试链接人工联系候选人。",
  });
  expect(sendEmail).not.toHaveBeenCalled();
});
