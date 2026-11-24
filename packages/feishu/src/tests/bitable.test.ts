import { describe, expect, it, vi } from "vitest";
import {
  createFeishuBitableRecord,
  getFeishuBitableRecord,
  parseFeishuBitableUrl,
  resolveFeishuBitableAppToken,
  updateFeishuBitableRecord,
  uploadFeishuBitableMedia,
} from "../bitable";

function resolveUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

describe("parseFeishuBitableUrl", () => {
  it("parses Feishu wiki bitable URLs with a table query parameter", () => {
    expect(
      parseFeishuBitableUrl(
        "https://ccnkw20gi2o0.feishu.cn/wiki/T5Oqw6ezmiZ4ZekJZlQcgjkHngc?table=tbl2fu01yOa78tql&view=vew6lZmj8J",
      ),
    ).toEqual({
      kind: "wiki",
      nodeToken: "T5Oqw6ezmiZ4ZekJZlQcgjkHngc",
      tableId: "tbl2fu01yOa78tql",
    });
  });

  it("parses direct base bitable URLs and rejects invalid URLs", () => {
    expect(parseFeishuBitableUrl("https://acme.larksuite.com/base/app12345?table=tbl999")).toEqual({
      appToken: "app12345",
      kind: "base",
      tableId: "tbl999",
    });
    expect(parseFeishuBitableUrl("https://ccnkw20gi2o0.feishu.cn/wiki/abc")).toBeNull();
    expect(parseFeishuBitableUrl("https://example.com/wiki/abc?table=tbl1")).toBeNull();
  });
});

describe("resolveFeishuBitableAppToken", () => {
  it("resolves wiki node obj_token and caches subsequent lookups", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          code: 0,
          data: {
            node: {
              obj_token: "bascnResolvedToken",
              obj_type: "bitable",
            },
          },
        }),
      ),
    );
    const deps = {
      fetcher,
      getAccessToken: () => Promise.resolve("tenant-token-1"),
    };

    const first = await resolveFeishuBitableAppToken({ nodeToken: "wikiNodeCacheTest1" }, deps);
    const second = await resolveFeishuBitableAppToken({ nodeToken: "wikiNodeCacheTest1" }, deps);

    expect(first).toBe("bascnResolvedToken");
    expect(second).toBe("bascnResolvedToken");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("uploadFeishuBitableMedia", () => {
  it("uses upload_all when payload is within the single-upload threshold", async () => {
    const calls: { body: FormData | string | null; url: string }[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);
      const { body: rawBody } = init ?? {};
      let body: FormData | string | null = null;
      if (rawBody instanceof FormData) {
        body = rawBody;
      } else if (rawBody) {
        body = String(rawBody);
      }
      calls.push({ body, url });
      return Promise.resolve(Response.json({ code: 0, data: { file_token: "boxcnSmall1" } }));
    });

    const token = await uploadFeishuBitableMedia(
      {
        appToken: "app-1",
        bytes: new Uint8Array([1, 2, 3, 4]),
        fileName: "resume.pdf",
        mediaType: "application/pdf",
      },
      {
        chunkThresholdBytes: 1024,
        fetcher,
        getAccessToken: () => Promise.resolve("tenant-token-1"),
      },
    );

    expect(token).toBe("boxcnSmall1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/drive/v1/medias/upload_all");
    const form = calls[0]?.body;
    expect(form instanceof FormData ? form.get("parent_type") : null).toBe("bitable_file");
    expect(form instanceof FormData ? form.get("parent_node") : null).toBe("app-1");
  });

  it("chunks uploads through upload_prepare, upload_part, and upload_finish when exceeding threshold", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = resolveUrl(input);
      urls.push(url);
      if (url.endsWith("/drive/v1/medias/upload_prepare")) {
        return Promise.resolve(
          Response.json({
            code: 0,
            data: { block_num: 2, block_size: 4, upload_id: "up-1" },
          }),
        );
      }
      if (url.endsWith("/drive/v1/medias/upload_part")) {
        return Promise.resolve(Response.json({ code: 0, data: {} }));
      }
      if (url.endsWith("/drive/v1/medias/upload_finish")) {
        return Promise.resolve(Response.json({ code: 0, data: { file_token: "boxcnLarge1" } }));
      }
      return Promise.resolve(Response.json({ code: 1, msg: "unexpected" }, { status: 404 }));
    });

    const token = await uploadFeishuBitableMedia(
      {
        appToken: "app-2",
        bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
        fileName: "portfolio.mp4",
        mediaType: "video/mp4",
      },
      {
        chunkThresholdBytes: 5,
        fetcher,
        getAccessToken: () => Promise.resolve("tenant-token-1"),
      },
    );

    expect(token).toBe("boxcnLarge1");
    expect(urls).toEqual([
      "https://open.feishu.cn/open-apis/drive/v1/medias/upload_prepare",
      "https://open.feishu.cn/open-apis/drive/v1/medias/upload_part",
      "https://open.feishu.cn/open-apis/drive/v1/medias/upload_part",
      "https://open.feishu.cn/open-apis/drive/v1/medias/upload_finish",
    ]);
  });
});

describe("Bitable record operations", () => {
  it("creates, fetches, and updates a bitable record", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.endsWith("/bitable/v1/apps/app-1/tables/tbl-1/records")) {
        return Promise.resolve(
          Response.json({ code: 0, data: { record: { record_id: "rec-1" } } }),
        );
      }
      if (method === "GET" && url.endsWith("/bitable/v1/apps/app-1/tables/tbl-1/records/rec-1")) {
        return Promise.resolve(
          Response.json({
            code: 0,
            data: { record: { fields: { 候选人姓名: "张三" }, record_id: "rec-1" } },
          }),
        );
      }
      if (method === "PUT" && url.endsWith("/bitable/v1/apps/app-1/tables/tbl-1/records/rec-1")) {
        return Promise.resolve(
          Response.json({ code: 0, data: { record: { record_id: "rec-1" } } }),
        );
      }
      return Promise.resolve(Response.json({ code: 404 }, { status: 404 }));
    });
    const deps = {
      fetcher,
      getAccessToken: () => Promise.resolve("tenant-token-1"),
    };

    const created = await createFeishuBitableRecord(
      { appToken: "app-1", fields: { 候选人姓名: "张三" }, tableId: "tbl-1" },
      deps,
    );
    expect(created.recordId).toBe("rec-1");

    const loaded = await getFeishuBitableRecord(
      { appToken: "app-1", recordId: "rec-1", tableId: "tbl-1" },
      deps,
    );
    expect(loaded).toEqual({ fields: { 候选人姓名: "张三" }, recordId: "rec-1" });

    const updated = await updateFeishuBitableRecord(
      { appToken: "app-1", fields: { 材料状态: "已齐全" }, recordId: "rec-1", tableId: "tbl-1" },
      deps,
    );
    expect(updated.recordId).toBe("rec-1");
  });
});
