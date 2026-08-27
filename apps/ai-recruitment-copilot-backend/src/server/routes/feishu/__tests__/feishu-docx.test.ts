import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@arc/db-schema/json";
import {
  createFeishuDocx,
  grantFeishuDocxAccess,
  moveFeishuDocx,
  resolveFeishuDocxDocumentId,
  updateFeishuDocxInterviewEvaluationStructure,
} from "../utils/feishu-docx";
import type { FeishuDocumentBlock } from "../utils/interview-evaluation-doc";

function jsonResponse(body: JsonValue, status = 200): Response {
  return Response.json(body, { status });
}

function textBlock(content: string): FeishuDocumentBlock {
  return {
    block_type: 2,
    text: { elements: [{ text_run: { content } }] },
  };
}

function calloutBlock(title: string): FeishuDocumentBlock {
  return {
    block_type: 19,
    callout: { background_color: 5, border_color: 5 },
    children: [textBlock(title), textBlock(`${title}正文`)],
  };
}

function existingResumeEvaluationPage(bodyContent: string): JsonValue {
  return {
    code: 0,
    data: {
      has_more: false,
      items: [
        {
          block_id: "docx-existing",
          block_type: 1,
          children: ["resume-callout"],
          parent_id: "",
        },
        {
          block_id: "resume-callout",
          block_type: 19,
          children: ["resume-title", "resume-body"],
          parent_id: "docx-existing",
        },
        {
          block_id: "resume-title",
          block_type: 2,
          parent_id: "resume-callout",
          text: { elements: [{ text_run: { content: "简历评价" } }] },
        },
        {
          block_id: "resume-body",
          block_type: 2,
          parent_id: "resume-callout",
          text: { elements: [{ text_run: { content: bodyContent } }] },
        },
      ],
    },
  };
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
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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

  it("inserts missing evaluation sections at their semantic anchors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            has_more: false,
            items: [
              {
                block_id: "docx-existing",
                block_type: 1,
                children: ["resume-file", "hr-callout", "rating", "business-callout"],
                parent_id: "",
              },
              { block_id: "resume-file", block_type: 23, parent_id: "docx-existing" },
              {
                block_id: "hr-callout",
                block_type: 19,
                children: ["hr-title"],
                parent_id: "docx-existing",
              },
              {
                block_id: "hr-title",
                block_type: 2,
                parent_id: "hr-callout",
                text: { elements: [{ text_run: { content: "HR面试评价" } }] },
              },
              { block_id: "rating", block_type: 4, parent_id: "docx-existing" },
              {
                block_id: "business-callout",
                block_type: 19,
                children: ["business-title"],
                parent_id: "docx-existing",
              },
              {
                block_id: "business-title",
                block_type: 2,
                parent_id: "business-callout",
                text: { elements: [{ text_run: { content: "业务一面评价" } }] },
              },
            ],
          },
          msg: "success",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { children: [{ block_id: "recommended", children: ["recommended-title"] }] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { children: [] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { children: [{ block_id: "resume-evaluation", children: ["resume-title"] }] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { children: [] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));

    const result = await updateFeishuDocxInterviewEvaluationStructure(
      {
        accessToken: "tenant-token",
        documentId: "docx-existing",
        recommendedQuestionsBlock: calloutBlock("推荐面试题"),
        resumeEvaluationBlock: calloutBlock("简历评价"),
      },
      { fetcher, sleep: vi.fn(() => Promise.resolve()) },
    );

    expect(result).toEqual({
      insertedSections: ["resumeEvaluation", "recommendedQuestions"],
      updatedSections: [],
    });
    expect(fetcher.mock.calls[1]?.[0]).toContain(
      "/documents/docx-existing/blocks/docx-existing/children",
    );
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      children: [{ block_type: 19, callout: { background_color: 5, border_color: 5 } }],
      index: 3,
    });
    expect(JSON.parse(String(fetcher.mock.calls[4]?.[1]?.body))).toEqual({
      children: [{ block_type: 19, callout: { background_color: 5, border_color: 5 } }],
      index: 1,
    });
    expect(fetcher.mock.calls[2]?.[0]).toContain("/blocks/recommended/children");
    expect(fetcher.mock.calls[3]?.[0]).toContain("/blocks/recommended-title");
    expect(fetcher.mock.calls[5]?.[0]).toContain("/blocks/resume-evaluation/children");
    expect(fetcher.mock.calls[6]?.[0]).toContain("/blocks/resume-title");
  });

  it("does not duplicate evaluation sections that already exist", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              block_id: "docx-existing",
              block_type: 1,
              children: ["resume-callout", "recommended-callout"],
            },
            {
              block_id: "resume-callout",
              block_type: 19,
              children: ["resume-title", "resume-body"],
              parent_id: "docx-existing",
            },
            {
              block_id: "resume-title",
              block_type: 2,
              parent_id: "resume-callout",
              text: {
                elements: [
                  { mention_user: { user_id: "ou_admin" } },
                  { text_run: { content: "简历评价" } },
                ],
              },
            },
            {
              block_id: "resume-body",
              block_type: 2,
              parent_id: "resume-callout",
              text: { elements: [{ text_run: { content: "简历评价正文" } }] },
            },
            {
              block_id: "recommended-callout",
              block_type: 19,
              children: ["recommended-title", "recommended-body"],
              parent_id: "docx-existing",
            },
            {
              block_id: "recommended-title",
              block_type: 2,
              parent_id: "recommended-callout",
              text: { elements: [{ text_run: { content: "推荐面试题" } }] },
            },
            {
              block_id: "recommended-body",
              block_type: 2,
              parent_id: "recommended-callout",
              text: { elements: [{ text_run: { content: "推荐面试题正文" } }] },
            },
          ],
        },
      }),
    );

    await expect(
      updateFeishuDocxInterviewEvaluationStructure(
        {
          accessToken: "tenant-token",
          documentId: "docx-existing",
          recommendedQuestionsBlock: calloutBlock("推荐面试题"),
          resumeEvaluationBlock: calloutBlock("简历评价"),
        },
        { fetcher, sleep: vi.fn(() => Promise.resolve()) },
      ),
    ).resolves.toEqual({ insertedSections: [], updatedSections: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("updates changed system-owned content and leaves matching content untouched", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(existingResumeEvaluationPage("旧正文")))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document_revision_id: 2 } }))
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { children: [{ block_id: "resume-body-new" }] } }),
      )
      .mockResolvedValueOnce(jsonResponse(existingResumeEvaluationPage("简历评价正文")));
    const options = {
      accessToken: "tenant-token",
      documentId: "docx-existing",
      resumeEvaluationBlock: calloutBlock("简历评价"),
    };
    const dependencies = { fetcher, sleep: vi.fn(() => Promise.resolve()) };

    await expect(
      updateFeishuDocxInterviewEvaluationStructure(options, dependencies),
    ).resolves.toEqual({
      insertedSections: [],
      updatedSections: ["resumeEvaluation"],
    });
    await expect(
      updateFeishuDocxInterviewEvaluationStructure(options, dependencies),
    ).resolves.toEqual({ insertedSections: [], updatedSections: [] });

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[1]?.[0]).toContain(
      "/blocks/resume-callout/children/batch_delete?client_token=",
    );
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      end_index: 2,
      start_index: 1,
    });
    expect(fetcher.mock.calls[2]?.[0]).toContain("/blocks/resume-callout/children?client_token=");
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual({
      children: [textBlock("简历评价正文")],
    });
  });

  it("uses a new idempotency token when the same Feishu block is edited again", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(existingResumeEvaluationPage("第一次漂移")))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { children: [] } }))
      .mockResolvedValueOnce(jsonResponse(existingResumeEvaluationPage("第二次漂移")))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { children: [] } }));
    const options = {
      accessToken: "tenant-token",
      documentId: "docx-existing",
      resumeEvaluationBlock: calloutBlock("简历评价"),
    };
    const dependencies = { fetcher, sleep: vi.fn(() => Promise.resolve()) };

    await updateFeishuDocxInterviewEvaluationStructure(options, dependencies);
    await updateFeishuDocxInterviewEvaluationStructure(options, dependencies);

    expect(fetcher.mock.calls[4]?.[0]).not.toBe(fetcher.mock.calls[1]?.[0]);
    expect(fetcher.mock.calls[5]?.[0]).not.toBe(fetcher.mock.calls[2]?.[0]);
  });

  it("serializes concurrent updates for the same document", async () => {
    let appendCount = 0;
    const { promise: firstDelete, resolve: resolveFirstDelete } = Promise.withResolvers<Response>();
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const url = String(input);
      if (init?.method === "GET") {
        const body = appendCount === 0 ? "旧正文" : "简历评价正文";
        return Promise.resolve(jsonResponse(existingResumeEvaluationPage(body)));
      }
      if (url.includes("batch_delete")) {
        return firstDelete;
      }
      appendCount += 1;
      return Promise.resolve(jsonResponse({ code: 0, data: { children: [] } }));
    });
    const options = {
      accessToken: "tenant-token",
      documentId: "docx-existing",
      resumeEvaluationBlock: calloutBlock("简历评价"),
    };
    const dependencies = { fetcher, sleep: vi.fn(() => Promise.resolve()) };

    const firstUpdate = updateFeishuDocxInterviewEvaluationStructure(options, dependencies);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const secondUpdate = updateFeishuDocxInterviewEvaluationStructure(options, dependencies);
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(2);
    resolveFirstDelete(jsonResponse({ code: 0, data: {} }));
    await expect(Promise.all([firstUpdate, secondUpdate])).resolves.toEqual([
      { insertedSections: [], updatedSections: ["resumeEvaluation"] },
      { insertedSections: [], updatedSections: [] },
    ]);
    expect(appendCount).toBe(1);
  });

  it("retries an interrupted insertion with stable Feishu idempotency tokens", async () => {
    const missingSectionPage = {
      code: 0,
      data: {
        has_more: false,
        items: [
          {
            block_id: "docx-existing",
            block_type: 1,
            children: ["hr-callout", "business-callout"],
          },
          {
            block_id: "hr-callout",
            block_type: 19,
            children: ["hr-title"],
            parent_id: "docx-existing",
          },
          {
            block_id: "hr-title",
            block_type: 2,
            parent_id: "hr-callout",
            text: { elements: [{ text_run: { content: "HR面试评价" } }] },
          },
          {
            block_id: "business-callout",
            block_type: 19,
            children: ["business-title"],
            parent_id: "docx-existing",
          },
          {
            block_id: "business-title",
            block_type: 2,
            parent_id: "business-callout",
            text: { elements: [{ text_run: { content: "业务一面评价" } }] },
          },
        ],
      },
    } satisfies JsonValue;
    const createdCallout = {
      code: 0,
      data: { children: [{ block_id: "recommended", children: ["recommended-title"] }] },
    } satisfies JsonValue;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(missingSectionPage))
      .mockResolvedValueOnce(jsonResponse(createdCallout))
      .mockResolvedValueOnce(jsonResponse({ code: 1_770_001, msg: "temporary failure" }, 500))
      .mockResolvedValueOnce(jsonResponse(missingSectionPage))
      .mockResolvedValueOnce(jsonResponse(createdCallout))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { children: [] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));
    const options = {
      accessToken: "tenant-token",
      documentId: "docx-existing",
      recommendedQuestionsBlock: calloutBlock("推荐面试题"),
    };
    const dependencies = { fetcher, sleep: vi.fn(() => Promise.resolve()) };

    await expect(
      updateFeishuDocxInterviewEvaluationStructure(options, dependencies),
    ).rejects.toThrow("temporary failure");
    await expect(
      updateFeishuDocxInterviewEvaluationStructure(options, dependencies),
    ).resolves.toEqual({ insertedSections: ["recommendedQuestions"], updatedSections: [] });

    const firstTopLevelCreateUrl = String(fetcher.mock.calls[1]?.[0]);
    const retryTopLevelCreateUrl = String(fetcher.mock.calls[4]?.[0]);
    expect(firstTopLevelCreateUrl).toContain("client_token=");
    expect(retryTopLevelCreateUrl).toBe(firstTopLevelCreateUrl);
    expect(fetcher.mock.calls[6]?.[0]).toContain("/blocks/recommended-title");
  });

  it("validates every required anchor before changing the document", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              block_id: "docx-existing",
              block_type: 1,
              children: ["business-callout"],
            },
            {
              block_id: "business-callout",
              block_type: 19,
              children: ["business-title"],
              parent_id: "docx-existing",
            },
            {
              block_id: "business-title",
              block_type: 2,
              parent_id: "business-callout",
              text: { elements: [{ text_run: { content: "业务一面评价" } }] },
            },
          ],
        },
      }),
    );

    await expect(
      updateFeishuDocxInterviewEvaluationStructure(
        {
          accessToken: "tenant-token",
          documentId: "docx-existing",
          recommendedQuestionsBlock: calloutBlock("推荐面试题"),
          resumeEvaluationBlock: calloutBlock("简历评价"),
        },
        { fetcher, sleep: vi.fn(() => Promise.resolve()) },
      ),
    ).rejects.toThrow("缺少“HR面试评价”板块");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
