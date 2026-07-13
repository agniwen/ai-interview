// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ResumePoolDetail } from "@arc/shared/resume-pool";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumePoolRecommendationsPanel } from "./resume-pool-recommendations-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const recommendationsPostMock = vi.hoisted(() => vi.fn());
const rpcFetchMock = vi.hoisted(() => vi.fn());
const bindResumePoolItemMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

class MockApiError extends Error {
  status: number;
  constructor(status: number) {
    super("api error");
    this.name = "MockApiError";
    this.status = status;
  }
}

vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      w: {
        ":slug": {
          studio: {
            "resume-pool": {
              ":id": {
                recommendations: {
                  $post: recommendationsPostMock,
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
  bindResumePoolItem: bindResumePoolItemMock,
  isApiError: (error: unknown): error is MockApiError => error instanceof MockApiError,
  rpcFetch: rpcFetchMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const baseDetail = {
  id: "resume-1",
  jobDescriptionId: null,
} as unknown as ResumePoolDetail;

const readyResult = {
  diagnostics: { filteredByThreshold: 0, vectorHitCount: 1 },
  recommendations: [
    {
      departmentName: "研发部",
      description: "负责后端服务开发",
      id: "jd-1",
      name: "高级后端工程师",
      reasons: ["技能高度匹配", "工作经验符合要求"],
      score: 87,
      similarity: { skillRole: 0.9 },
    },
  ],
  resume: { id: "resume-1" },
  status: "ready",
};

function renderPanel() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { container, queryClient, root };
}

async function renderAndFlush(detail: ResumePoolDetail, queryClient?: QueryClient) {
  const rendered = renderPanel();
  const client = queryClient ?? rendered.queryClient;
  await act(async () => {
    rendered.root.render(
      <QueryClientProvider client={client}>
        <ResumePoolRecommendationsPanel detail={detail} slug="test-slug" />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  return { ...rendered, queryClient: client };
}

function findMatchButton() {
  return [...document.querySelectorAll("button")].find((btn) =>
    btn.textContent?.includes("匹配到此岗位"),
  );
}

describe("ResumePoolRecommendationsPanel", () => {
  it("renders nothing when the resume is already bound to a job description", async () => {
    const { root } = await renderAndFlush({
      ...baseDetail,
      jobDescriptionId: "jd-1",
    });

    expect(rpcFetchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("renders the disabled hint when semantic indexing is disabled", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { filteredByThreshold: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "disabled",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("语义索引未启用");
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders the indexing hint while the job description / resume index is processing", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { filteredByThreshold: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "indexing",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("索引处理中，稍后重试");
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders the error hint when the recommendations query fails", async () => {
    rpcFetchMock.mockRejectedValue(new Error("network error"));

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("推荐加载失败");
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders Top-N cards with name, score and reasons when ready", async () => {
    rpcFetchMock.mockResolvedValue(readyResult);

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("高级后端工程师");
    });

    expect(document.body.textContent).toContain("87");
    expect(document.body.textContent).toContain("技能高度匹配");
    expect(findMatchButton()).not.toBeUndefined();

    act(() => {
      root.unmount();
    });
  });

  it("distinguishes no-hit from filtered-out empty states using diagnostics", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { filteredByThreshold: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "ready",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("暂无命中");
    });

    act(() => {
      root.unmount();
    });
  });

  it("shows the filtered-by-threshold empty state when hits existed but none qualified", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { filteredByThreshold: 5, vectorHitCount: 5 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "ready",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("暂无合适岗位");
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders nothing when the resume is already matched", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { filteredByThreshold: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "already_matched",
    });

    const { root } = await renderAndFlush(baseDetail);

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("clicking the match button triggers bindResumePoolItem with the recommendation's job description id", async () => {
    rpcFetchMock.mockResolvedValue(readyResult);
    bindResumePoolItemMock.mockResolvedValue({ ...baseDetail, jobDescriptionId: "jd-1" });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(findMatchButton()).not.toBeUndefined();
    });

    await act(async () => {
      findMatchButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(bindResumePoolItemMock).toHaveBeenCalledWith("test-slug", "resume-1", "jd-1");

    act(() => {
      root.unmount();
    });
  });

  it("disables the match button while the bind mutation is pending", async () => {
    rpcFetchMock.mockResolvedValue(readyResult);
    const deferredBind = Promise.withResolvers<ResumePoolDetail>();
    bindResumePoolItemMock.mockImplementation(() => deferredBind.promise);

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(findMatchButton()).not.toBeUndefined();
    });

    act(() => {
      findMatchButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(findMatchButton()?.hasAttribute("disabled")).toBe(true);
    });

    await act(async () => {
      deferredBind.resolve({ ...baseDetail, jobDescriptionId: "jd-1" });
      await Promise.resolve();
    });

    act(() => {
      root.unmount();
    });
  });

  it("invalidates the detail and list queries on a successful bind", async () => {
    rpcFetchMock.mockResolvedValue(readyResult);
    bindResumePoolItemMock.mockResolvedValue({ ...baseDetail, jobDescriptionId: "jd-1" });

    const { queryClient, root } = await renderAndFlush(baseDetail);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await vi.waitFor(() => {
      expect(findMatchButton()).not.toBeUndefined();
    });

    await act(async () => {
      findMatchButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resume-pool", "detail", "test-slug", "resume-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resume-pool", "test-slug"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("shows a conflict toast and refetches the detail query on a 409 bind error", async () => {
    rpcFetchMock.mockResolvedValue(readyResult);
    bindResumePoolItemMock.mockRejectedValue(new MockApiError(409));

    const { queryClient, root } = await renderAndFlush(baseDetail);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await vi.waitFor(() => {
      expect(findMatchButton()).not.toBeUndefined();
    });

    await act(async () => {
      findMatchButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastErrorMock).toHaveBeenCalledWith("该简历已绑定岗位");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resume-pool", "detail", "test-slug", "resume-1"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("shows a generic error toast on a non-409 bind error", async () => {
    rpcFetchMock.mockResolvedValue(readyResult);
    bindResumePoolItemMock.mockRejectedValue(new Error("boom"));

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(findMatchButton()).not.toBeUndefined();
    });

    await act(async () => {
      findMatchButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastErrorMock).toHaveBeenCalledWith("绑定失败");

    act(() => {
      root.unmount();
    });
  });
});
