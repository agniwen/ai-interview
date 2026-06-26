// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DataGridModule from "@/components/data-grid";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueueJobDetailDialog, QueueOverview, QueuesGrid } from "./queues-grid";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const matchedUploadQueueJob = vi.hoisted(() => ({
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
  organization: {
    id: "org-1",
    name: "测试组织",
    slug: "test-org",
  },
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
}));

const capturedGridOptions = vi.hoisted(() => ({
  current: null as {
    initialFilters?: Record<string, string>;
    queryFn?: (params: {
      filters: Record<string, string>;
      page: number;
      pageSize: number;
      search: string;
    }) => Promise<unknown>;
  } | null,
}));

const rpcQueueJobsGetMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/data-grid", async () => {
  const actual = await vi.importActual<typeof DataGridModule>("@/components/data-grid");

  return {
    ...actual,
    useDataGridState: vi.fn((options) => {
      capturedGridOptions.current = options as typeof capturedGridOptions.current;

      return {
        bind: {
          canResetFilters: false,
          data: [matchedUploadQueueJob],
          filterValues: {
            parseStatus: "all",
            queue: "resume-parse",
            search: "",
            state: "all",
            uploadStatus: "all",
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
            pageSize: 20,
          },
          refetching: false,
          rowSelection: {},
          sorting: [],
          total: 1,
          totalPages: 1,
        },
        invalidate: vi.fn(),
        search: "",
      };
    }),
  };
});

vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      platform: {
        queues: {
          $get: vi.fn(),
          ":queueName": {
            jobs: {
              $get: rpcQueueJobsGetMock,
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/client/api", () => ({
  rpcFetch: vi.fn(() =>
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
      ],
      total: 1,
    }),
  ),
}));

afterEach(() => {
  document.body.innerHTML = "";
  capturedGridOptions.current = null;
  vi.clearAllMocks();
});

describe("QueuesGrid", () => {
  it("shows upload task fields in the list and keeps actions pinned right", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <QueuesGrid />
          </TooltipProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("文件名");
    expect(document.body.textContent).toContain("Nolan.jpeg");
    expect(document.body.textContent).toContain("上传任务状态");
    expect(document.body.textContent).toContain("解析状态");
    expect(document.body.textContent).toContain("解析中");
    expect(capturedGridOptions.current?.initialFilters).toMatchObject({
      parseStatus: "all",
      uploadStatus: "all",
    });

    const actionHeader = [...document.querySelectorAll("th")].find((cell) =>
      cell.textContent?.includes("操作"),
    );
    expect(actionHeader?.style.position).toBe("sticky");
    expect(actionHeader?.style.right).toBe("0px");

    const actionCell = [...document.querySelectorAll("td")].find((cell) =>
      cell.textContent?.includes("详情"),
    );
    expect(actionCell?.style.position).toBe("sticky");
    expect(actionCell?.style.right).toBe("0px");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("passes upload and parse status filters to the jobs query", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <QueuesGrid />
          </TooltipProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const queryFn = capturedGridOptions.current?.queryFn;
    expect(queryFn).toBeTypeOf("function");

    await queryFn?.({
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

    expect(rpcQueueJobsGetMock).toHaveBeenCalledWith({
      param: { queueName: "resume-parse" },
      query: {
        page: "2",
        pageSize: "20",
        parseStatus: "failed",
        state: "all",
        uploadStatus: "processing",
      },
    });

    act(() => {
      root.unmount();
    });
    queryClient.clear();
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
