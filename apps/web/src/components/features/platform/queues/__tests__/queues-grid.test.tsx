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
import { TooltipProvider } from "@/components/ui/tooltip";
import { installNoopResizeObserver, installNoopWebAnimations } from "@/test-utils/react-act";
import {
  QueueJobDetailDialog,
  QueueOverview,
  QueuesGrid,
  createQueueJobsFetcher,
} from "../queues-grid";
import type { QueuesGridDependencies } from "../queues-grid";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();
installNoopWebAnimations();
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

const matchedUploadQueueJob = {
  attemptsMade: 1,
  attemptsStarted: 1,
  data: {
    batchId: "batch-1",
    itemId: "item-1",
    organizationId: "org-1",
    userId: "user-1",
  },
  failedReason: null,
  finishedOn: null,
  id: "item-1",
  name: "parse-resume-upload-item",
  organization: { id: "org-1", name: "测试组织", slug: "test-org" },
  processedBy: "worker-1",
  processedOn: "2026-06-15T10:00:00.000Z",
  progress: 0,
  resumeDetail: {
    attemptCount: 2,
    batch: {
      failedCount: 0,
      processedCount: 1,
      status: "running",
      succeededCount: 1,
      target: "resume_pool",
      totalCount: 3,
    },
    batchId: "batch-1",
    candidateEmail: "nolan@example.com",
    candidateName: "Nolan",
    errorMessage: null,
    fileSize: 2048,
    finishedAt: null,
    itemId: "item-1",
    itemStatus: "processing",
    organizationId: "org-1",
    organizationName: "测试组织",
    organizationSlug: "test-org",
    originalFileName: "Nolan.jpeg",
    poolItemId: "pool-1",
    poolScope: "private",
    poolStatus: "active",
    queuedAt: "2026-06-15T09:58:00.000Z",
    resumeParseError: null,
    resumeParseStatus: "processing",
    resumeRecordId: null,
    startedAt: "2026-06-15T10:00:00.000Z",
    targetRole: "资深美术设计",
    userEmail: "uploader@example.com",
    userId: "user-1",
    userImage: null,
    userName: "上传人",
  },
  returnvalue: null,
  state: "active",
  timestamp: "2026-06-15T09:59:00.000Z",
  triggeredBy: {
    email: "uploader@example.com",
    id: "user-1",
    image: null,
    name: "上传人",
  },
};

function createDependencies(): QueuesGridDependencies {
  return {
    fetchJobs: vi.fn(() =>
      Promise.resolve({
        page: 1,
        pageSize: 20,
        records: [matchedUploadQueueJob],
        state: "all",
        total: 1,
        totalPages: 1,
      }),
    ),
    fetchOverview: vi.fn(() =>
      Promise.resolve({
        records: [
          {
            counts: {
              active: 1,
              completed: 0,
              delayed: 0,
              failed: 0,
              paused: 0,
              prioritized: 0,
              waiting: 0,
              "waiting-children": 0,
            },
            displayName: "简历解析",
            name: "resume-parse",
            redis: null,
            workers: [],
            workersCount: 0,
          },
          {
            counts: {
              active: 0,
              completed: 0,
              delayed: 0,
              failed: 0,
              paused: 0,
              prioritized: 0,
              waiting: 2,
              "waiting-children": 0,
            },
            displayName: "AI分析",
            name: "resume-review-generation",
            redis: null,
            workers: [],
            workersCount: 0,
          },
        ],
        total: 2,
      }),
    ),
  };
}

async function renderQueuesGrid(dependencies: QueuesGridDependencies) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <QueuesGrid dependencies={dependencies} />
        </TooltipProvider>
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

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("QueuesGrid", () => {
  it("shows upload task fields and keeps actions pinned right", async () => {
    const dependencies = createDependencies();
    const rendered = await renderQueuesGrid(dependencies);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Nolan.jpeg");
    });

    expect(document.body.textContent).toContain("文件名");
    expect(document.body.textContent).toContain("简历解析");
    expect(document.body.textContent).toContain("AI分析");
    expect(document.body.textContent).toContain("上传任务状态");
    expect(document.body.textContent).toContain("解析状态");
    expect(document.body.textContent).toContain("解析中");
    expect(dependencies.fetchJobs).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "20",
        parseStatus: "all",
        state: "all",
        uploadStatus: "all",
      },
      queueName: "resume-parse",
    });

    const actionHeader = [...document.querySelectorAll("th")].find((cell) =>
      cell.textContent?.includes("操作"),
    );
    expect(actionHeader?.style.position).toBe("sticky");
    expect(actionHeader?.style.insetInlineEnd).toBe("0px");

    const actionCell = [...document.querySelectorAll("td")].find((cell) =>
      cell.textContent?.includes("详情"),
    );
    expect(actionCell?.style.position).toBe("sticky");
    expect(actionCell?.style.insetInlineEnd).toBe("0px");

    act(() => {
      rendered.root.unmount();
    });
    rendered.queryClient.clear();
  });

  it("passes upload and parse status filters to the jobs query", async () => {
    const dependencies = createDependencies();
    const fetchJobs = createQueueJobsFetcher(dependencies.fetchJobs);

    await fetchJobs({
      filters: {
        parseStatus: "failed",
        queue: "resume-parse",
        state: "all",
        uploadStatus: "processing",
      },
      page: 2,
      pageSize: 20,
      search: "",
    });

    expect(dependencies.fetchJobs).toHaveBeenCalledWith({
      query: {
        page: "2",
        pageSize: "20",
        parseStatus: "failed",
        state: "all",
        uploadStatus: "processing",
      },
      queueName: "resume-parse",
    });
  });

  it("uses the AI analysis queue when that tab filter is selected", async () => {
    const dependencies = createDependencies();
    const fetchJobs = createQueueJobsFetcher(dependencies.fetchJobs);

    await fetchJobs({
      filters: {
        parseStatus: "all",
        queue: "resume-review-generation",
        state: "waiting",
        uploadStatus: "all",
      },
      page: 1,
      pageSize: 20,
      search: "",
    });

    expect(dependencies.fetchJobs).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "20",
        parseStatus: "all",
        state: "waiting",
        uploadStatus: "all",
      },
      queueName: "resume-review-generation",
    });
  });
});

describe("QueueJobDetailDialog", () => {
  it("shows the matched upload task status instead of raw job JSON", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueueJobDetailDialog job={matchedUploadQueueJob} onOpenChange={vi.fn()} />);
    });

    expect(document.body.textContent).toContain("上传任务状态");
    expect(document.body.textContent).toContain("处理中");
    expect(document.body.textContent).toContain("解析状态");
    expect(document.body.textContent).toContain("解析中");
    expect(document.body.textContent).toContain("Nolan.jpeg");
    expect(document.body.textContent).toContain("1 / 3");
    expect(document.body.textContent).not.toContain('"attemptsMade"');

    act(() => {
      root.unmount();
    });
  });
});

describe("QueueOverview", () => {
  it("does not count active jobs as pending", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <QueueOverview
          overview={{
            counts: {
              active: 2,
              completed: 3,
              delayed: 1,
              failed: 0,
              paused: 1,
              prioritized: 1,
              waiting: 4,
              "waiting-children": 1,
            },
            displayName: "简历解析",
            name: "resume-parse",
            redis: {
              db: 0,
              host: "127.0.0.1",
              port: 6379,
              protocol: "redis:",
              usesPassword: true,
              usesUsername: false,
            },
            workers: [],
            workersCount: 1,
          }}
        />,
      );
    });

    expect(document.body.textContent).toContain("排队中8");
    expect(document.body.textContent).toContain("处理中2");

    act(() => {
      root.unmount();
    });
  });
});
