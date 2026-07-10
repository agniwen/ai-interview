// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MailIngestLogDrawer,
  renderRunSummary,
  serializeDateRange,
} from "./mail-ingest-log-drawer";
import type { MailIngestLogAccount } from "./mail-ingest-log-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpcMessagesGetMock = vi.hoisted(() => vi.fn());
const rpcFetchMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      w: {
        ":slug": {
          studio: {
            "mail-ingest-accounts": {
              managed: {
                ":id": {
                  messages: {
                    $get: rpcMessagesGetMock,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/client/api", () => ({
  rpcFetch: rpcFetchMock,
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const account: MailIngestLogAccount = {
  emailAddress: "inbox@example.com",
  id: "acc-1",
  lastCheckedAt: null,
  lastError: null,
  lastRunFailed: null,
  lastRunMatched: null,
  lastRunQueued: null,
  lastRunReceived: null,
  lastRunSubjectSkipped: null,
};

function renderDrawer() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { container, queryClient, root };
}

describe("renderRunSummary", () => {
  const zero = {
    lastRunFailed: 0,
    lastRunMatched: 0,
    lastRunQueued: 0,
    lastRunReceived: 0,
    lastRunSubjectSkipped: 0,
  };

  it("never polled → 尚未轮询, no counts", () => {
    expect(renderRunSummary({ ...zero, lastCheckedAt: null, lastError: null })).toMatchObject({
      label: "尚未轮询",
      showCounts: false,
    });
  });

  it("checked + error + all-zero → 最近轮询失败, no counts, error passed", () => {
    const r = renderRunSummary({
      ...zero,
      lastCheckedAt: "2026-07-10T00:00:00.000Z",
      lastError: "IMAP down",
    });
    expect(r).toMatchObject({
      error: "IMAP down",
      label: "最近轮询失败，暂无成功快照",
      showCounts: false,
    });
  });

  it("has snapshot (nullable counts) → show counts", () => {
    const r = renderRunSummary({
      lastCheckedAt: "2026-07-10T00:00:00.000Z",
      lastError: null,
      lastRunFailed: null,
      lastRunMatched: null,
      lastRunQueued: null,
      lastRunReceived: 5,
      lastRunSubjectSkipped: null,
    });
    expect(r).toMatchObject({ label: "上轮快照", showCounts: true });
  });
});

describe("serializeDateRange", () => {
  it("from → local day start, to → local day end; from>to throws", () => {
    const r = serializeDateRange("2026-07-01", "2026-07-02");
    expect(r.receivedFrom).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    expect(r.receivedTo).toBe(new Date(2026, 6, 2, 23, 59, 59, 999).toISOString());
    expect(() => serializeDateRange("2026-07-03", "2026-07-01")).toThrow();
  });
});

describe("MailIngestLogDrawer messages table", () => {
  it("renders records with status/date fallbacks, error/skip reasons, attachment counts, and expands attachments", async () => {
    rpcFetchMock.mockResolvedValue({
      records: [
        {
          attachmentCount: 2,
          attachments: [],
          boundJobDescriptionName: null,
          errorMessage: "boom",
          fromAddress: null,
          id: "a",
          jdBindStatus: null,
          poolSummary: null,
          receivedAt: null,
          resumeAttachmentCount: 1,
          status: "failed",
          subject: null,
        },
        {
          attachments: [
            {
              fileName: "x.pdf",
              hasDuplicate: true,
              resumeParseError: "bad",
              resumeParseStatus: "failed",
            },
          ],
          id: "b",
          skipReason: "no_supported_attachment",
          status: "skipped",
        },
      ],
      total: 2,
    });

    const { queryClient, root } = renderDrawer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailIngestLogDrawer account={account} onOpenChange={vi.fn()} open slug="test-slug" />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("boom");
    });

    expect(document.body.textContent).toContain("no_supported_attachment");
    expect(document.body.textContent).toContain("（无主题）");
    expect(document.body.textContent).toContain("—");
    expect(document.body.textContent).toContain("1/2");

    const expandButton = document.querySelector<HTMLButtonElement>('button[aria-label="展开附件"]');
    expect(expandButton).not.toBeNull();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("x.pdf");
    expect(document.body.textContent).toContain("bad");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("distinguishes no-record empty state from filtered empty state", async () => {
    rpcFetchMock.mockResolvedValue({ records: [], total: 0 });

    const { queryClient, root } = renderDrawer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailIngestLogDrawer account={account} onOpenChange={vi.fn()} open slug="test-slug" />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("该邮箱暂无入库记录");
    });

    const keywordInput = document.querySelector<HTMLInputElement>('input[aria-label="关键词"]');
    expect(keywordInput).not.toBeNull();

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (keywordInput) {
        valueSetter?.call(keywordInput, "foo");
        keywordInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("当前筛选条件下无匹配邮件");
    });

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("suppresses the empty-state text when the date range is invalid", async () => {
    rpcFetchMock.mockResolvedValue({ records: [], total: 0 });

    const { queryClient, root } = renderDrawer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailIngestLogDrawer account={account} onOpenChange={vi.fn()} open slug="test-slug" />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("该邮箱暂无入库记录");
    });

    const fromInput = document.querySelector<HTMLInputElement>('input[aria-label="起始日期"]');
    const toInput = document.querySelector<HTMLInputElement>('input[aria-label="结束日期"]');
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    act(() => {
      valueSetter?.call(toInput, "2024-01-01");
      toInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      valueSetter?.call(fromInput, "2024-02-01");
      fromInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("起始日期不能晚于结束日期");
    });

    expect(document.body.textContent).not.toContain("该邮箱暂无入库记录");
    expect(document.body.textContent).not.toContain("当前筛选条件下无匹配邮件");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });
});

describe("MailIngestLogDrawer summary + refresh", () => {
  const accountWithSnapshot: MailIngestLogAccount = {
    emailAddress: "inbox@example.com",
    id: "acc-1",
    lastCheckedAt: "2026-07-10T00:00:00.000Z",
    lastError: null,
    lastRunFailed: 1,
    lastRunMatched: 2,
    lastRunQueued: 2,
    lastRunReceived: 5,
    lastRunSubjectSkipped: 1,
  };

  it("shows the derived run summary text at the top when opened with an account", async () => {
    rpcFetchMock.mockResolvedValue({ records: [], total: 0 });

    const { queryClient, root } = renderDrawer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailIngestLogDrawer
            account={accountWithSnapshot}
            onOpenChange={vi.fn()}
            open
            slug="test-slug"
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("上轮快照");
    expect(document.body.textContent).toContain("收到5 · 标题不符1 · 命中2 · 入队2 · 失败1");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("refresh() invalidates both the messages query and the account list query", async () => {
    rpcFetchMock.mockResolvedValue({ records: [], total: 0 });

    const { queryClient, root } = renderDrawer();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailIngestLogDrawer
            account={accountWithSnapshot}
            onOpenChange={vi.fn()}
            open
            slug="test-slug"
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const refreshButton = [...document.querySelectorAll("button")].find(
      (btn) => btn.textContent === "刷新",
    );
    expect(refreshButton).not.toBeUndefined();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["mail-ingest-messages", "test-slug", "acc-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["managed-mail-ingest-accounts", "test-slug"],
    });

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });
});
