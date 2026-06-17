// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueueJobDetailDialog, QueueOverview } from "./queues-grid";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("QueueJobDetailDialog", () => {
  it("shows the matched upload task status instead of raw job JSON", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <QueueJobDetailDialog
          job={{
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
          }}
          onOpenChange={vi.fn()}
        />,
      );
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
