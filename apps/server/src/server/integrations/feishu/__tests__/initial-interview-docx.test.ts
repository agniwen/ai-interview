import { describe, expect, it, vi } from "vitest";
import { replaceFeishuDocxHrInitialInterview } from "../feishu-docx";
const text = (content: string) => ({
  block_type: 2,
  text: { elements: [{ text_run: { content } }] },
});
const desired = {
  block_type: 19,
  callout: { background_color: 4, border_color: 4 },
  children: [text("HR面试评价"), text("到岗时间：下周一")],
};
function page(duplicate = false, body = "HR 手动编辑的旧内容") {
  return Response.json({
    code: 0,
    data: {
      items: [
        { block_id: "doc", block_type: 1, children: ["manual", "hr", "second"] },
        { block_id: "manual", ...text("招聘备注") },
        { block_id: "hr", block_type: 19, children: ["title", "body"] },
        { block_id: "title", ...text("HR面试评价") },
        { block_id: "body", ...text(body) },
        { block_id: "second", block_type: 19, children: ["second-title", "second-body"] },
        { block_id: "second-title", ...text(duplicate ? "HR面试评价" : "真人复面") },
        { block_id: "second-body", ...text("复面人工内容") },
      ],
    },
  });
}
describe("recorded initial interview HR replacement", () => {
  it("replaces the HR body including manual edits while preserving all other sections", async () => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "GET"
          ? page()
          : Response.json({ code: 0, data: { children: [{ block_id: "new-body" }] } }),
      ),
    );
    await replaceFeishuDocxHrInitialInterview(
      { accessToken: "token", block: desired, documentId: "doc" },
      { fetcher, sleep: () => Promise.resolve() },
    );
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method !== "GET");
    expect(writes.map(([, init]) => init?.method)).toEqual(["DELETE", "POST"]);
    expect(writes.every(([url]) => String(url).includes("/blocks/hr/children"))).toBe(true);
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toMatchObject({
      end_index: 2,
      start_index: 1,
    });
  });
  it("refuses an ambiguous HR section without writing anything", async () => {
    const fetcher = vi.fn(() => Promise.resolve(page(true)));
    await expect(
      replaceFeishuDocxHrInitialInterview(
        { accessToken: "token", block: desired, documentId: "doc" },
        { fetcher, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow("无法唯一定位");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not rewrite an identical generated result", async () => {
    const fetcher = vi.fn(() => Promise.resolve(page(false, "到岗时间：下周一")));
    await replaceFeishuDocxHrInitialInterview(
      { accessToken: "token", block: desired, documentId: "doc" },
      { fetcher, sleep: () => Promise.resolve() },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
