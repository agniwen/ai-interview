// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeParseCacheGrid } from "../resume-parse-cache-grid";
import type {
  ResumeParseCacheDependencies,
  ResumeParseCacheRecord,
} from "../resume-parse-cache-grid";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function ResizeObserverMock() {
  return {
    disconnect: () => {},
    observe: () => {},
    unobserve: () => {},
  };
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string): MediaQueryList => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

const cacheRecord: ResumeParseCacheRecord = {
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
  parsedStatus: "ready",
  parsedTextSource: "qwen-ocr",
  size: 2048,
  storageKey: "attachments/resume.pdf",
  userEmail: "user@example.com",
  userName: "上传人",
};

const fetchCacheMock = vi.fn<ResumeParseCacheDependencies["fetchCache"]>();
const fetchDetailMock = vi.fn<ResumeParseCacheDependencies["fetchDetail"]>();
const deleteCacheMock = vi.fn<ResumeParseCacheDependencies["deleteCache"]>();

const dependencies: ResumeParseCacheDependencies = {
  deleteCache: deleteCacheMock,
  fetchCache: fetchCacheMock,
  fetchDetail: fetchDetailMock,
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function findButton(label: string) {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

async function renderGrid() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ResumeParseCacheGrid dependencies={dependencies} />
      </QueryClientProvider>
    ),
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([indexRoute]),
  });

  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
    await Promise.resolve();
  });

  return { queryClient, root };
}

describe("ResumeParseCacheGrid", () => {
  it("shows JSON and requires popover confirmation before deleting", async () => {
    fetchCacheMock.mockResolvedValue({
      page: 1,
      pageSize: 10,
      records: [cacheRecord],
      total: 1,
      totalPages: 1,
    });
    fetchDetailMock.mockResolvedValue({
      ...cacheRecord,
      contentHash: cacheRecord.contentHash,
      parsedError: null,
      parsedStructured: { name: "张三" },
      parsedText: "张三的简历文本",
    });
    deleteCacheMock.mockResolvedValue({ clearedCount: 2 });

    const rendered = await renderGrid();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("resume.pdf");
    });

    expect(findButton("查看")).toBeTruthy();
    expect(findButton("删除")).toBeTruthy();
    const actionsHeader = [...document.querySelectorAll("th")].find(
      (header) => header.textContent?.trim() === "操作",
    );
    expect(actionsHeader?.style.width).toBe("122px");
    expect(actionsHeader?.style.minWidth).toBe("122px");
    expect(actionsHeader?.style.maxWidth).toBe("122px");
    expect(actionsHeader?.querySelector("div")?.classList.contains("px-2.5")).toBe(true);
    expect(findButton("删除")?.classList.contains("px-2.5")).toBe(true);
    expect(findButton("删除")?.classList.contains("pr-0")).toBe(false);

    await act(async () => {
      findButton("查看")?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("解析缓存 JSON");
      expect(document.body.textContent).toContain('"parsedStructured"');
    });
    expect(document.body.textContent).toContain('"name": "张三"');

    await act(async () => {
      findButton("删除")?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("确定删除这份解析缓存？");
    });
    expect(document.body.textContent).toContain("同一文件 Hash");
    expect(deleteCacheMock).not.toHaveBeenCalled();

    await act(async () => {
      findButton("确认删除")?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(deleteCacheMock).toHaveBeenCalledWith("sha256-demo");
    });

    act(() => rendered.root.unmount());
    rendered.queryClient.clear();
  });
});
