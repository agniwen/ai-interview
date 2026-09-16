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
});
