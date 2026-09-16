import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { createRoundEmailsRouter } from "../route";
import type { Env } from "../../../../../../../type";

function setup(authorized = true) {
  const preview = vi.fn().mockResolvedValue({ confirmationToken: "signed-preview" });
  const confirm = vi.fn().mockResolvedValue({ status: "pending" });
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("activeOrg", {
      createdAt: new Date(),
      id: "org",
      logo: null,
      metadata: null,
      name: "Org",
      slug: "org",
    });
    // SAFETY: This route only consumes the authenticated user's id.
    c.set("user", { id: "hr" } as NonNullable<Env["Variables"]["user"]>);
    await next();
  });
  app.route(
    "/",
    createRoundEmailsRouter({
      buildSenderFromAddress: () => "unused@example.com",
      confirmManualAiInvitation: confirm,
      previewManualAiInvitation: preview,
      requirePermission: () => async (c, next) => {
        if (!authorized) {
          return c.json({ message: "Forbidden" }, 403);
        }
        await next();
      },
      sendEmail: vi.fn(),
      visibility: vi.fn().mockResolvedValue({ kind: "none" }),
    }),
  );
  return { app, confirm, preview };
}

it("preview only invokes the scoped read, never confirmation", async () => {
  const { app, confirm, preview } = setup();
  const response = await app.request("/round/preview-invitation");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(preview).toHaveBeenCalledExactlyOnceWith({
    actorUserId: "hr",
    organizationId: "org",
    roundId: "round",
    visibility: { kind: "none" },
  });
  expect(confirm).not.toHaveBeenCalled();
});
it.each([{}, { confirmationToken: "token", confirmed: false }, { confirmed: true }])(
  "rejects missing confirmation: %o",
  async (body) => {
    const { app, confirm } = setup();
    const response = await app.request("/round/confirm-invitation", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
  },
);
it("only confirmed requests reach the queue command", async () => {
  const { app, confirm } = setup();
  const response = await app.request("/round/confirm-invitation", {
    body: JSON.stringify({ confirmationToken: "token", confirmed: true }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.status).toBe(202);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(
    { actorUserId: "hr", organizationId: "org", roundId: "round", visibility: { kind: "none" } },
    "token",
  );
});
it("requires interview update permission before preview or sending", async () => {
  const { app, confirm, preview } = setup(false);
  const read = await app.request("/round/preview-invitation");
  const write = await app.request("/round/confirm-invitation", { method: "POST" });
  expect(read.status).toBe(403);
  expect(write.status).toBe(403);
  expect(confirm).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
});
