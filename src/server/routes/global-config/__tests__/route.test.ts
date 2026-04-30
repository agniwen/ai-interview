// 中文：globalConfigRouter 单元测试 — 使用 mock 查询，无需真实数据库
// English: globalConfigRouter unit tests — uses mocked queries, no real DB

import { globalConfigRouter } from "../route";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/queries/global-config", () => ({
  getGlobalConfig: vi.fn(() => ({
    closingInstructions: "",
    companyContext: "",
    openingInstructions: "",
    updatedAt: "1970-01-01T00:00:00.000Z",
    updatedBy: null,
  })),
  upsertGlobalConfig: vi.fn((input: Record<string, unknown>, userId: string | null) => ({
    ...input,
    updatedAt: "2026-04-29T00:00:00.000Z",
    updatedBy: userId,
  })),
}));

function makeGetRequest() {
  return new Request("http://test/", {
    headers: { "content-type": "application/json" },
    method: "GET",
  });
}

function makePutRequest(body: unknown) {
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
  });

  it("PUT / persists trimmed values and echoes them back", async () => {
    const payload = {
      closingInstructions: "感谢候选人参加",
      companyContext: "公司介绍",
      openingInstructions: "用候选人姓名打招呼",
    };
    const res = await globalConfigRouter.fetch(makePutRequest(payload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openingInstructions).toBe(payload.openingInstructions);
    expect(json.closingInstructions).toBe(payload.closingInstructions);
    expect(json.companyContext).toBe(payload.companyContext);
  });

  it("PUT / rejects oversized payload", async () => {
    const huge = "x".repeat(5000);
    const res = await globalConfigRouter.fetch(
      makePutRequest({
        closingInstructions: "",
        companyContext: "",
        openingInstructions: huge,
      }),
    );
    expect(res.status).toBe(400);
  });
});
