import { describe, expect, it, vi } from "vitest";
import { updateFeishuDocxHumanInterviewEvaluation } from "../feishu-docx";
const text = (content: string) => ({
  block_type: 2,
  text: { elements: [{ text_run: { content } }] },
});
const block = {
  block_type: 19,
  callout: { background_color: 4, border_color: 4 },
  children: [text("架构复面"), text("确认通过")],
};
function page(body = "确认通过") {
  return Response.json({
    code: 0,
    data: {
      items: [
        { block_id: "doc", block_type: 1, children: ["manual", "owned"] },
        { block_id: "manual", ...text("飞书人工内容") },
        { block_id: "owned", block_type: 19, children: ["title", "body"] },
        { block_id: "title", ...text("架构复面") },
        { block_id: "body", ...text(body) },
      ],
    },
  });
}
describe("human interview document block sync", () => {
  it("does not duplicate a completed block after a lost success response", async () => {
    const fetcher = vi.fn(() => Promise.resolve(page()));
    await updateFeishuDocxHumanInterviewEvaluation(
      {
        accessToken: "token",
        block,
        blockId: "owned",
        documentId: "doc",
        onBlockCreated: vi.fn(),
        snapshotId: "snapshot",
      },
      { fetcher, sleep: async () => {} },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("checkpoints a newly created block before populating it", async () => {
    const order: string[] = [];
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      order.push(init?.method ?? "GET");
      if (order.length === 1) {
        return Promise.resolve(
          Response.json({
            code: 0,
            data: { children: [{ block_id: "owned", children: ["title"] }] },
          }),
        );
      }
      if (init?.method === "GET") {
        return Promise.resolve(page("尚未填充"));
      }
      return Promise.resolve(Response.json({ code: 0, data: { children: [] } }));
    });
    await updateFeishuDocxHumanInterviewEvaluation(
      {
        accessToken: "token",
        block,
        blockId: null,
        documentId: "doc",
        onBlockCreated: (id) => {
          expect(id).toBe("owned");
          order.push("checkpoint");
          return Promise.resolve();
        },
        snapshotId: "snapshot",
      },
      { fetcher, sleep: async () => {} },
    );
    expect(order.slice(0, 3)).toEqual(["POST", "checkpoint", "GET"]);
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method !== "GET");
    expect(JSON.stringify(writes)).not.toContain("manual");
  });
  it("reports a deleted owned block instead of recreating or replacing other content", async () => {
    const fetcher = vi.fn(() => Promise.resolve(page()));
    await expect(
      updateFeishuDocxHumanInterviewEvaluation(
        {
          accessToken: "token",
          block,
          blockId: "deleted",
          documentId: "doc",
          onBlockCreated: vi.fn(),
          snapshotId: "snapshot",
        },
        { fetcher, sleep: async () => {} },
      ),
    ).rejects.toThrow("区块已被删除");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
