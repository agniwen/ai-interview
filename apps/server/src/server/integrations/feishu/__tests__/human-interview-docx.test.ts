import { describe, expect, it, vi } from "vitest";
import { updateFeishuDocxHumanInterviewEvaluation } from "../feishu-docx";
import { INTERVIEW_STAGE_PLACEHOLDER_FIELDS } from "../interview-evaluation-doc";
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
  it("backfills the original interviewer above the rating without rewriting evaluation text", async () => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "GET"
          ? page("评级：C")
          : Response.json({ code: 0, data: { children: [{ block_id: "interviewer" }] } }),
      ),
    );
    await updateFeishuDocxHumanInterviewEvaluation(
      {
        accessToken: "token",
        block: {
          ...block,
          children: [text("架构复面"), text("面试官：光芒"), text("评级（A,B,C,D）：C（通过）")],
        },
        blockId: "owned",
        documentId: "doc",
        onBlockCreated: vi.fn(),
        ratingOnly: true,
        snapshotId: "snapshot",
      },
      { fetcher, sleep: () => Promise.resolve() },
    );
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method !== "GET");
    expect(writes.map(([, init]) => init?.method)).toEqual(["PATCH", "POST"]);
    expect(JSON.parse(String(writes[1]?.[1]?.body))).toMatchObject({
      children: [text("面试官：光芒")],
      index: 1,
    });
  });
  it("updates only the rating when resolving a historical outcome", async () => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(init?.method === "GET" ? page("评级：C") : Response.json({ code: 0 })),
    );
    await updateFeishuDocxHumanInterviewEvaluation(
      {
        accessToken: "token",
        block: { ...block, children: [text("架构复面"), text("评级（A,B,C,D）：C（通过）")] },
        blockId: "owned",
        documentId: "doc",
        onBlockCreated: vi.fn(),
        ratingOnly: true,
        snapshotId: "snapshot",
      },
      { fetcher, sleep: () => Promise.resolve() },
    );
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(String(writes[0]?.[0])).toContain("/blocks/body");
    expect(writes[0]?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({
      update_text_elements: { elements: text("评级（A,B,C,D）：C（通过）").text.elements },
    });
  });
  it("does not rewrite the section if the rating cannot be identified", async () => {
    const fetcher = vi.fn(() => Promise.resolve(page("飞书手动改写的字段")));
    await expect(
      updateFeishuDocxHumanInterviewEvaluation(
        {
          accessToken: "token",
          block,
          blockId: "owned",
          documentId: "doc",
          onBlockCreated: vi.fn(),
          ratingOnly: true,
          snapshotId: "snapshot",
        },
        { fetcher, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow("评级字段缺失或不唯一");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    ["业务三面", 2],
    ["业务五面", 3],
  ])("inserts %s in business order before HRD", async (roundLabel, index) => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") {
        return Promise.resolve(
          Response.json({
            code: 0,
            data: {
              items: [
                { block_id: "doc", block_type: 1, children: ["one", "two", "four", "hrd"] },
                ...["业务一面评价", "业务二面评价", "业务四面评价", "HRD面试评价"].flatMap(
                  (title, i) => {
                    const id = ["one", "two", "four", "hrd"][i];
                    return [
                      { block_id: id, block_type: 19, children: [`title-${i}`] },
                      { block_id: `title-${i}`, ...text(title) },
                    ];
                  },
                ),
                { block_id: "owned", block_type: 19, children: ["new-title"] },
                { block_id: "new-title", ...text("") },
              ],
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          code: 0,
          data: { children: [{ block_id: "owned", children: ["new-title"] }] },
        }),
      );
    });
    await updateFeishuDocxHumanInterviewEvaluation(
      {
        accessToken: "token",
        block,
        blockId: null,
        documentId: "doc",
        onBlockCreated: () => Promise.resolve(),
        roundLabel,
        snapshotId: "snapshot",
      },
      { fetcher, sleep: () => Promise.resolve() },
    );
    const creation = fetcher.mock.calls.find(
      ([url, init]) => init?.method === "POST" && String(url).includes("/blocks/doc/children"),
    );
    expect(JSON.parse(String(creation?.[1]?.body))).toMatchObject({ index });
  });

  it.each(["业务一面", "CEO面试"])("does not overwrite a filled %s section", async (roundLabel) => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          code: 0,
          data: {
            items: [
              { block_id: "doc", block_type: 1, children: ["manual"] },
              { block_id: "manual", block_type: 19, children: ["title", "body"] },
              { block_id: "title", ...text(`${roundLabel}评价`) },
              { block_id: "body", ...text("面试官在飞书填写的内容") },
            ],
          },
        }),
      ),
    );
    const checkpoint = vi.fn();
    await expect(
      updateFeishuDocxHumanInterviewEvaluation(
        {
          accessToken: "token",
          block,
          blockId: null,
          documentId: "doc",
          onBlockCreated: checkpoint,
          roundLabel,
          snapshotId: "snapshot",
        },
        { fetcher, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow("已有内容");
    expect(checkpoint).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["业务一面", "CEO面试"])(
    "links %s to its untouched template without a duplicate",
    async (roundLabel) => {
      const fields = roundLabel === "CEO面试" ? [] : INTERVIEW_STAGE_PLACEHOLDER_FIELDS;
      const writes: string[] = [];
      const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        writes.push(init?.method ?? "GET");
        return Promise.resolve(
          init?.method === "GET"
            ? Response.json({
                code: 0,
                data: {
                  items: [
                    { block_id: "doc", block_type: 1, children: ["slot"] },
                    {
                      block_id: "slot",
                      block_type: 19,
                      children: ["title", ...fields.map((_, i) => `field-${i}`)],
                    },
                    { block_id: "title", ...text(`${roundLabel}评价`) },
                    ...fields.map((field, i) => ({
                      block_id: `field-${i}`,
                      ...text(field),
                    })),
                  ],
                },
              })
            : Response.json({ code: 0, data: {} }),
        );
      });
      const checkpoint = vi.fn(() => Promise.resolve());
      await updateFeishuDocxHumanInterviewEvaluation(
        {
          accessToken: "token",
          block: { ...block, children: [text(`${roundLabel}评价`), text("确认通过")] },
          blockId: null,
          documentId: "doc",
          onBlockCreated: checkpoint,
          roundLabel,
          snapshotId: "snapshot",
        },
        { fetcher, sleep: () => Promise.resolve() },
      );
      expect(checkpoint).toHaveBeenCalledWith("slot");
      expect(
        fetcher.mock.calls.filter(
          ([url, init]) => init?.method === "POST" && String(url).includes("/blocks/doc/children"),
        ),
      ).toHaveLength(0);
    },
  );

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
