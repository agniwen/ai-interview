import { describe, expect, it, vi, beforeEach } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type * as MailIngestDao from "../dao";

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  listAccountMailMessages: vi.fn(),
  mailIngestAccountExistsInOrg: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/auth", () => ({
  auth: { api: { hasPermission: mocks.hasPermission } },
}));
vi.mock("../dao", async (importOriginal) => ({
  ...(await importOriginal<typeof MailIngestDao>()),
  listAccountMailMessages: mocks.listAccountMailMessages,
  mailIngestAccountExistsInOrg: mocks.mailIngestAccountExistsInOrg,
}));

const { mailIngestRouter } = await import("../route");

const app = factory
  .createApp()
  .use(async (c, next) => {
    c.set("activeOrg", { id: "org_1" } as never);
    c.set("member", { role: "admin" } as never);
    c.set("user", { id: "admin_1" } as never);
    await next();
  })
  .route("/mail-ingest-accounts", mailIngestRouter);

describe("managed messages permission (real middleware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mailIngestAccountExistsInOrg.mockResolvedValue(true);
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
  });

  it("denies (403) and requires manage when hasPermission fails", async () => {
    mocks.hasPermission.mockResolvedValue({ success: false });

    const res = await app.request("/mail-ingest-accounts/managed/account_1/messages");

    expect(res.status).toBe(403);
    expect(mocks.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: { permissions: { mailIngestAccount: ["manage"] } } }),
    );
    expect(mocks.listAccountMailMessages).not.toHaveBeenCalled();
  });

  it("allows (200) when hasPermission succeeds", async () => {
    mocks.hasPermission.mockResolvedValue({ success: true });
    const res = await app.request("/mail-ingest-accounts/managed/account_1/messages");
    expect(res.status).toBe(200);
  });
});
