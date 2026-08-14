import { describe, expect, it, vi } from "vitest";
import {
  createFeishuDocx,
  grantFeishuDocxAccess,
  moveFeishuDocx,
  resolveFeishuDocxDocumentId,
} from "../utils/feishu-docx";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("createFeishuDocx", () => {
  it("grants edit access to an existing application-owned document", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 0, data: { member: {} }, msg: "success" }));

    await grantFeishuDocxAccess(
      {
        accessToken: "tenant-token",
        documentId: "docx-existing",
        recipientOpenId: "ou_admin",
      },
      { fetcher: fetcher as typeof fetch, sleep: vi.fn() },
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/drive/v1/permissions/docx-existing/members?type=docx",
      expect.objectContaining({
        body: JSON.stringify({
          member_id: "ou_admin",
          member_type: "openid",
          perm: "edit",
          type: "user",
        }),
      }),
    );
  });

  it("creates, fills, and shares a styled document", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { document: { document_id: "docx-1" } }, msg: "success" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            children: [
              { block_id: "heading-1" },
              { block_id: "callout-1", children: ["callout-empty-text"] },
            ],
          },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {}, msg: "success" }))
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
            children: [
              {
                block_type: 2,
                text: {
                  elements: [
                    {
                      text_run: {
                        content: "业务一面评价",
                        text_element_style: { bold: true },
                      },
                    },
                  ],
                },
              },
              { block_type: 2, text: { elements: [] } },
            ],
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
    expect(fetcher).toHaveBeenCalledTimes(5);
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
      "https://open.feishu.cn/open-apis/docx/v1/documents/docx-1/blocks/callout-empty-text",
    );
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual({
      update_text_elements: {
        elements: [
          {
            text_run: {
              content: "业务一面评价",
              text_element_style: { bold: true },
            },
          },
        ],
      },
    });
    expect(fetcher.mock.calls[3]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/docx/v1/documents/docx-1/blocks/callout-1/children",
    );
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({
      children: [{ block_type: 2, text: { elements: [] } }],
    });
    expect(fetcher.mock.calls[4]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/drive/v1/permissions/docx-1/members?type=docx",
    );
    expect(JSON.parse(String(fetcher.mock.calls[4]?.[1]?.body))).toEqual({
      member_id: "ou_hr",
      member_type: "openid",
      perm: "edit",
      type: "user",
    });
    expect(sleep).toHaveBeenCalled();
  });

  it("moves the created document into the configured folder", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { document: { document_id: "docx-folder" } },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { member: {} }, msg: "success" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {}, msg: "success" }));

    await createFeishuDocx(
      {
        accessToken: "tenant-token",
        blocks: [],
        folderToken: "fldcn-evaluations",
        recipientOpenId: "ou_hr",
        title: "王五 - 面试评价表",
      },
      { fetcher, sleep: vi.fn(() => Promise.resolve()) },
    );

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      title: "王五 - 面试评价表",
    });
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/drive/v1/files/docx-folder/move",
    );
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual({
      folder_token: "fldcn-evaluations",
      type: "docx",
    });
  });

  it("continues creating and moving a document when granting access is denied", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { document: { document_id: "docx-removed-user" } },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 1_063_002, msg: "Permission denied" }, 403))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {}, msg: "success" }));

    await expect(
      createFeishuDocx(
        {
          accessToken: "tenant-token",
          blocks: [],
          folderToken: "fldcn-evaluations",
          recipientOpenId: "ou_removed",
          title: "已移除候选人的面试评价表",
        },
        { fetcher, sleep: vi.fn(() => Promise.resolve()) },
      ),
    ).resolves.toEqual({
      documentId: "docx-removed-user",
      documentUrl: "https://feishu.cn/docx/docx-removed-user",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/drive/v1/files/docx-removed-user/move",
    );
  });

  it("embeds the PDF resume as the first document block", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { document: { document_id: "docx-with-resume" } },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            children: [
              { block_id: "resume-view", children: ["resume-block"] },
              { block_id: "heading-block" },
            ],
          },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { file_token: "file-resume" }, msg: "success" }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {}, msg: "success" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { member: {} }, msg: "success" }));

    await createFeishuDocx(
      {
        accessToken: "tenant-token",
        attachment: {
          bytes: new Uint8Array([37, 80, 68, 70]),
          fileName: "张三-简历.pdf",
        },
        blocks: [{ block_type: 4, heading2: { elements: [] } }],
        recipientOpenId: "ou_hr",
        title: "张三 - 面试评价表",
      },
      { fetcher, sleep: vi.fn(() => Promise.resolve()) },
    );

    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      children: [
        { block_type: 23, file: { token: "", view_type: 2 } },
        { block_type: 4, heading2: { elements: [] } },
      ],
    });
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/drive/v1/medias/upload_all",
    );
    const uploadBody = fetcher.mock.calls[2]?.[1]?.body;
    expect(uploadBody).toBeInstanceOf(FormData);
    if (!(uploadBody instanceof FormData)) {
      throw new Error("Expected Feishu resume upload to use FormData");
    }
    expect(uploadBody.get("file_name")).toBe("张三-简历.pdf");
    expect(uploadBody.get("parent_type")).toBe("docx_file");
    expect(uploadBody.get("parent_node")).toBe("resume-block");
    expect(uploadBody.get("size")).toBe("4");
    expect(uploadBody.get("extra")).toBe(JSON.stringify({ drive_route_token: "docx-with-resume" }));
    expect(fetcher.mock.calls[3]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/docx/v1/documents/docx-with-resume/blocks/resume-block",
    );
    expect(fetcher.mock.calls[3]?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({
      replace_file: { token: "file-resume" },
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
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

describe("existing Feishu documents", () => {
  it("recovers the document id from a stored docx URL", () => {
    expect(resolveFeishuDocxDocumentId(null, "https://feishu.cn/docx/docx-from-url")).toBe(
      "docx-from-url",
    );
    expect(resolveFeishuDocxDocumentId("docx-stored", "https://feishu.cn/docx/ignored")).toBe(
      "docx-stored",
    );
  });

  it("allows an existing document to be moved repeatedly", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 0, data: {}, msg: "success" })),
      );
    const options = {
      accessToken: "tenant-token",
      documentId: "docx-existing",
      folderToken: "fldcn-evaluations",
    };

    await moveFeishuDocx(options, { fetcher, sleep: vi.fn() });
    await moveFeishuDocx(options, { fetcher, sleep: vi.fn() });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://open.feishu.cn/open-apis/drive/v1/files/docx-existing/move",
      expect.objectContaining({
        body: JSON.stringify({ folder_token: "fldcn-evaluations", type: "docx" }),
      }),
    );
  });
});
