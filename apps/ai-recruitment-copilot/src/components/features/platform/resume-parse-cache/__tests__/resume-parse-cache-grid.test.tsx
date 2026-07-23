// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DataGridModule from "@/components/data-grid";
import { ResumeParseCacheGrid } from "../resume-parse-cache-grid";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function ResizeObserverMock() {
  return {
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
  };
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const cacheRecord = vi.hoisted(() => ({
  contentHash: "sha256-demo",
  createdAt: "2026-07-20T08:00:00.000Z",
  filename: "resume.pdf",
  hasStructured: true,
  hasText: true,
  id: "cache_1",
  mediaType: "application/pdf",
  organizationName: "测试工作区",
  parsedAt: "2026-07-20T08:01:00.000Z",
  parsedPageCount: 2,
  parsedStatus: "ready" as const,
  parsedTextSource: "qwen-ocr" as const,
  size: 2048,
  storageKey: "attachments/resume.pdf",
  userEmail: "user@example.com",
  userName: "上传人",
}));

const detailRequest = vi.hoisted(() => ({ type: "detail" }));
const deleteRequest = vi.hoisted(() => ({ type: "delete" }));
const deleteEndpointMock = vi.hoisted(() => vi.fn(() => deleteRequest));
const invalidateMock = vi.hoisted(() => vi.fn());
const rpcFetchMock = vi.hoisted(() =>
  vi.fn((request: { type: string }) => {
    if (request.type === "delete") {
      return Promise.resolve({ clearedCount: 2 });
    }
    return Promise.resolve({
      ...cacheRecord,
      parsedError: null,
      parsedStructured: { name: "张三" },
      parsedText: "张三的简历文本",
    });
  }),
);

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/data-grid", async () => {
  const actual = await vi.importActual<typeof DataGridModule>("@/components/data-grid");
  return {
    ...actual,
    useDataGridState: vi.fn(() => ({
      bind: {
        canResetFilters: false,
        data: [cacheRecord],
        filterValues: {
          cacheType: "all",
          parsedStatus: "all",
          search: "",
          textSource: "all",
        },
        loading: false,
        onFilterChange: vi.fn(),
        onRefresh: vi.fn(),
        onResetFilters: vi.fn(),
        onRowSelectionChange: vi.fn(),
        onSortingChange: vi.fn(),
        pagination: {
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
          page: 1,
          pageSize: 10,
        },
        refetching: false,
        rowSelection: {},
        sorting: [],
        total: 1,
        totalPages: 1,
      },
      filters: {
        cacheType: "all",
        parsedStatus: "all",
        textSource: "all",
      },
      invalidate: invalidateMock,
      search: "",
      setFilter: vi.fn(),
    })),
  };
});

vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      platform: {
        "resume-parse-cache": {
          $get: vi.fn(),
          ":hash": {
            $delete: deleteEndpointMock,
            $get: vi.fn(() => detailRequest),
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/client/api", () => ({ rpcFetch: rpcFetchMock }));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function findButton(label: string) {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

describe("ResumeParseCacheGrid", () => {
  it("shows JSON and requires popover confirmation before deleting", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ResumeParseCacheGrid />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("resume.pdf");
    expect(findButton("查看")).toBeTruthy();
    expect(findButton("删除")).toBeTruthy();
    const actionsHeader = [...document.querySelectorAll("th")].find(
      (header) => header.textContent?.trim() === "操作",
    );
    expect(actionsHeader?.style.width).toBe("100px");
    expect(actionsHeader?.style.minWidth).toBe("100px");
    expect(actionsHeader?.style.maxWidth).toBe("100px");
    expect(findButton("删除")?.classList.contains("pr-0")).toBe(true);

    await act(async () => {
      findButton("查看")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("解析缓存 JSON");
    expect(document.body.textContent).toContain('"parsedStructured"');
    expect(document.body.textContent).toContain('"name": "张三"');

    await act(async () => {
      findButton("删除")?.click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("确定删除这份解析缓存？");
    expect(document.body.textContent).toContain("同一文件 Hash");
    expect(deleteEndpointMock).not.toHaveBeenCalled();

    await act(async () => {
      findButton("确认删除")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteEndpointMock).toHaveBeenCalledWith({ param: { hash: "sha256-demo" } });
    expect(invalidateMock).toHaveBeenCalledOnce();

    act(() => root.unmount());
    queryClient.clear();
  });
});
