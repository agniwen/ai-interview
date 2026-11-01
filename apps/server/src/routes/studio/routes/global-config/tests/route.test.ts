// 中文：globalConfigRouter 单元测试 — 使用 mock 查询，无需真实数据库
// English: globalConfigRouter unit tests — uses mocked queries, no real DB

import type { GlobalConfigRouterDependencies } from "../route";
import { createGlobalConfigRouter } from "../route";
import { describe, expect, it, vi } from "vitest";

interface GlobalConfigInput {
  closingInstructions: string;
  companyContext: string;
  companyName: string;
  jobCodePrefix: string;
  openingInstructions: string;
}

const dependencies = {
  getGlobalConfig: vi.fn(() =>
    Promise.resolve({
      closingInstructions: "",
      companyContext: "",
      companyName: "",
      jobCodePrefix: "AUR",
      openingInstructions: "",
      updatedAt: "1970-01-01T00:00:00.000Z",
      updatedBy: null,
    }),
  ),
  requirePermission:
    () =>
    async (c: { set: (key: string, value: { id: string }) => void }, next: () => Promise<void>) => {
      c.set("activeOrg", { id: "test-org" });
      await next();
    },
  upsertGlobalConfig: vi.fn((input: GlobalConfigInput, userId: string | null, _orgId: string) =>
    Promise.resolve({
      ...input,
      updatedAt: "2026-04-29T00:00:00.000Z",
      updatedBy: userId,
    }),
  ),
} satisfies GlobalConfigRouterDependencies;

const globalConfigRouter = createGlobalConfigRouter(dependencies);

function makeGetRequest() {
  return new Request("http://test/", {
    headers: { "content-type": "application/json" },
    method: "GET",
  });
}

function makePutRequest(body: GlobalConfigInput) {
  return new Request("http://test/", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
}

describe("globalConfigRouter", () => {
  it("GET / returns the current config", async () => {
    const res = await globalConfigRouter.fetch(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openingInstructions).toBe("");
    expect(json.closingInstructions).toBe("");
    expect(json.companyContext).toBe("");
    expect(json.jobCodePrefix).toBe("AUR");
  });

  it("PUT / persists trimmed values and echoes them back", async () => {
    const payload = {
      closingInstructions: "感谢候选人参加",
      companyContext: "公司介绍",
      companyName: "示例公司",
      jobCodePrefix: "hrd",
      openingInstructions: "用候选人姓名打招呼",
    };
    const res = await globalConfigRouter.fetch(makePutRequest(payload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openingInstructions).toBe(payload.openingInstructions);
    expect(json.closingInstructions).toBe(payload.closingInstructions);
    expect(json.companyContext).toBe(payload.companyContext);
    expect(json.jobCodePrefix).toBe("HRD");
  });

  it("PUT / rejects oversized payload", async () => {
    // schema 限制 openingInstructions 最多 10_000 字符，这里超一个字符触发校验。
    // openingInstructions has a 10_000 char cap in the schema; +1 trips validation.
    const huge = "x".repeat(10_001);
    const res = await globalConfigRouter.fetch(
      makePutRequest({
        closingInstructions: "",
        companyContext: "",
        companyName: "",
        jobCodePrefix: "AUR",
        openingInstructions: huge,
      }),
    );
    expect(res.status).toBe(400);
  });
});
