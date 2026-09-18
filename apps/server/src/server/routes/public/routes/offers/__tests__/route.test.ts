import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPublicOffersRouter } from "../route";
import type { PublicOfferDependencies } from "../route";
const mocks = { loadOffer: vi.fn(), recordAccess: vi.fn(), respond: vi.fn() };
const publicOffersRouter = createPublicOffersRouter(mocks);
function offer(status: "sent" | "superseded" = "sent") {
  const row: NonNullable<Awaited<ReturnType<PublicOfferDependencies["loadOffer"]>>> = {
    baseSalary: 28_000,
    bonus: null,
    candidateName: "候选人",
    companyName: null,
    currency: "CNY",
    declineReason: null,
    equity: null,
    expiresAt: new Date("2026-09-16T00:00:00Z"),
    id: "old",
    joiningDate: null,
    organizationId: "org",
    organizationName: "公司",
    position: "工程师",
    publishedAt: new Date("2026-09-16T00:00:00Z"),
    publishedSnapshot: null,
    recruitingRecordId: "record",
    responseAt: null,
    status,
  };
  mocks.loadOffer.mockResolvedValue(row);
  mocks.respond.mockResolvedValue({ status: "accepted" });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-16T08:30:00Z"));
  offer();
});
afterEach(() => vi.useRealTimers());
const responseRequest = () =>
  new Request("http://localhost/token/respond", {
    body: JSON.stringify({ response: "accepted" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
describe("公开 Offer 有效性", () => {
  it("截止日当天读取及确认仍可用", async () => {
    const get = await publicOffersRouter.request("/token");
    expect(await get.json()).toMatchObject({
      expiresAt: "2026-09-16T15:59:59.999Z",
      status: "sent",
    });
    const response = await publicOffersRouter.fetch(responseRequest());
    expect(response.status).toBe(200);
    expect(mocks.respond).toHaveBeenCalledOnce();
  });
  it("次日零点展示过期并拒绝响应", async () => {
    vi.setSystemTime(new Date("2026-09-16T16:00:00Z"));
    const get = await publicOffersRouter.request("/token");
    expect(await get.json()).toMatchObject({
      status: "expired",
    });
    const response = await publicOffersRouter.fetch(responseRequest());
    expect(response.status).toBe(410);
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it("失效链接可查看历史但不可响应", async () => {
    offer("superseded");
    const get = await publicOffersRouter.request("/token");
    expect(await get.json()).toMatchObject({
      status: "superseded",
    });
    const response = await publicOffersRouter.fetch(responseRequest());
    expect(response.status).toBe(410);
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it("uses the published approval snapshot rather than mutable draft columns", async () => {
    mocks.loadOffer.mockResolvedValueOnce({
      ...(await mocks.loadOffer()),
      baseSalary: 1,
      position: "已被后台改写的职位",
      publishedSnapshot: {
        baseSalary: 28_000,
        bonus: 5000,
        candidateId: "candidate",
        candidateName: "候选人",
        companyName: "公司",
        currency: "CNY",
        equity: null,
        expiresAt: "2026-09-16T15:59:59.999Z",
        jobDescriptionId: null,
        joiningDate: null,
        notes: "内部备注",
        organizationId: "org",
        position: "发布时的职位",
        recruitingRecordId: "record",
        schemaVersion: 1,
      },
    });

    const response = await publicOffersRouter.request("/token");

    expect(await response.json()).toMatchObject({
      baseSalary: 28_000,
      bonus: 5000,
      position: "发布时的职位",
    });
  });

  it("preserves null terms and expiry from a published snapshot", async () => {
    const row = await mocks.loadOffer();
    const snapshot = {
      baseSalary: 28_000,
      bonus: null,
      candidateId: "candidate",
      candidateName: "候选人",
      companyName: "公司",
      currency: "CNY",
      equity: null,
      expiresAt: null,
      jobDescriptionId: null,
      joiningDate: null,
      notes: "内部备注",
      organizationId: "org",
      position: "工程师",
      recruitingRecordId: "record",
      schemaVersion: 1,
    };
    mocks.loadOffer.mockResolvedValue({
      ...row,
      bonus: 100_000,
      equity: "后来改写的期权",
      expiresAt: new Date("2026-09-01T00:00:00Z"),
      joiningDate: new Date("2026-10-01T00:00:00Z"),
      publishedSnapshot: snapshot,
    });

    const response = await publicOffersRouter.request("/token");
    expect(await response.json()).toMatchObject({
      bonus: null,
      equity: null,
      expiresAt: null,
      joiningDate: null,
      status: "sent",
    });
    const accepted = await publicOffersRouter.fetch(responseRequest());
    expect(accepted.status).toBe(200);
  });

  it("rejects a response after the frozen expiry even if the row was extended", async () => {
    const row = await mocks.loadOffer();
    mocks.loadOffer.mockResolvedValue({
      ...row,
      expiresAt: new Date("2026-10-01T00:00:00Z"),
      publishedSnapshot: { expiresAt: "2026-09-01T15:59:59.999Z" },
    });
    const rejected = await publicOffersRouter.fetch(responseRequest());
    expect(rejected.status).toBe(410);
    expect(mocks.respond).not.toHaveBeenCalled();
  });
});
