import { describe, expect, it, vi } from "vitest";
import { createFeishuDocx } from "../utils/feishu-docx";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("createFeishuDocx", () => {
  it("creates, fills, and shares a styled document", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { document: { document_id: "docx-1" } }, msg: "success" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { children: [{ block_id: "heading-1" }, { block_id: "callout-1" }] },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { children: [] }, msg: "success" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { member: {} }, msg: "success" }));
    const sleep = vi.fn(() => Promise.resolve());

    const result = await createFeishuDocx(
      {
        accessToken: "tenant-token",
        blocks: [
          { block_type: 4, heading2: { elements: [] } },
          {
            block_type: 19,
            callout: { background_color: 2, border_color: 2 },
            children: [{ block_type: 2, text: { elements: [] } }],
          },
        ],
        recipientOpenId: "ou_hr",
        title: "张三 - 面试评价表",
      },
      { fetcher, sleep },
    );

    expect(result).toEqual({
      documentId: "docx-1",
      documentUrl: "https://feishu.cn/docx/docx-1",
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://open.feishu.cn/open-apis/docx/v1/documents");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      title: "张三 - 面试评价表",
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/docx/v1/documents/docx-1/blocks/docx-1/children",
    );
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      children: [
        { block_type: 4, heading2: { elements: [] } },
        { block_type: 19, callout: { background_color: 2, border_color: 2 } },
      ],
    });
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/docx/v1/documents/docx-1/blocks/callout-1/children",
    );
    expect(fetcher.mock.calls[3]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/drive/v1/permissions/docx-1/members?type=docx",
    );
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({
      member_id: "ou_hr",
      member_type: "openid",
      perm: "edit",
      type: "user",
    });
    expect(sleep).toHaveBeenCalled();
  });

  it("retries a rate-limited Feishu request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 99_991_400, msg: "rate limited" }, 429))
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { document: { document_id: "docx-2" } }, msg: "success" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { children: [{ block_id: "heading-1" }] }, msg: "success" }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { member: {} }, msg: "success" }));
    const sleep = vi.fn(() => Promise.resolve());

    await createFeishuDocx(
      {
        accessToken: "tenant-token",
        blocks: [{ block_type: 4, heading2: { elements: [] } }],
        recipientOpenId: "ou_hr",
        title: "李四 - 面试评价表",
      },
      { fetcher, sleep },
    );

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledWith(500);
  });
});
