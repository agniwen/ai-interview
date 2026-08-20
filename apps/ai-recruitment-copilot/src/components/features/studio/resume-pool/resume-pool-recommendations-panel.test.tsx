// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type { ResumePoolDetail } from "@arc/shared/resume-pool";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumePoolRecommendationsPanel } from "./resume-pool-recommendations-panel";
import type { ResumePoolRecommendationsDependencies } from "./resume-pool-recommendations-panel";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpcFetchMock = vi.hoisted(() => vi.fn());
const fetchMatchResultMock = vi.hoisted(() =>
  vi.fn<ResumePoolRecommendationsDependencies["fetchMatchResult"]>(() => Promise.resolve(null)),
);
const fetchPublishedJobsMock = vi.hoisted(() =>
  vi.fn<ResumePoolRecommendationsDependencies["fetchPublishedJobs"]>(() => Promise.resolve([])),
);
const bindResumePoolItemMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

class MockApiError extends Error {
  status: number;
  constructor(status: number) {
    super("api error");
    this.name = "MockApiError";
    this.status = status;
  }
}

const dependencies: ResumePoolRecommendationsDependencies = {
  bindResumePoolItem: bindResumePoolItemMock,
  fetchMatchResult: fetchMatchResultMock,
  fetchPublishedJobs: fetchPublishedJobsMock,
  fetchRecommendations: rpcFetchMock,
  isConflictError: (error) => error instanceof MockApiError && error.status === 409,
  notifyError: toastErrorMock,
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetAllMocks();
  fetchMatchResultMock.mockResolvedValue(null);
  fetchPublishedJobsMock.mockResolvedValue([]);
});

// SAFETY: This test constructs the value with the asserted contract before this boundary.
const baseDetail = {
  id: "resume-1",
  jobDescriptionId: null,
} as ResumePoolDetail;

const readyResult = {
  diagnostics: { aboveThresholdCount: 1, eligibleCount: 0, vectorHitCount: 1 },
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

// SAFETY: The panel only reads these list fields; the production dependency returns full records.
const publishedJobs = [
  { departmentName: "研发部", id: "jd-1", name: "前端工程师" },
  { departmentName: "研发部", id: "jd-2", name: "全栈工程师" },
] as JobDescriptionListRecord[];

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
        <ResumePoolRecommendationsPanel
          dependencies={dependencies}
          detail={detail}
          slug="test-slug"
        />
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
  it("lists other published jobs when a bound resume has no persisted match run", async () => {
    fetchPublishedJobsMock.mockResolvedValue(publishedJobs);
    bindResumePoolItemMock.mockResolvedValue({ ...baseDetail, jobDescriptionId: "jd-2" });
    const { root } = await renderAndFlush({
      ...baseDetail,
      jobDescriptionId: "jd-1",
    });

    expect(rpcFetchMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("全栈工程师");
      expect(document.body.textContent).toContain("改绑到此岗位");
    });
    expect(document.body.textContent).not.toContain("前端工程师");
    const rebindButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("改绑到此岗位"),
    );
    await act(async () => {
      rebindButton?.click();
      await Promise.resolve();
    });
    expect(bindResumePoolItemMock).toHaveBeenCalledWith("test-slug", "resume-1", "jd-2");

    act(() => {
      root.unmount();
    });
  });

  it("shows persisted AI candidates for a bound mail resume and allows HR to rebind", async () => {
    fetchMatchResultMock.mockResolvedValueOnce({
      candidates: [
        {
          aiRank: 1,
          aiReason: "前端经验最匹配",
          aiScore: 88,
          available: true,
          code: "FE00001",
          departmentName: "研发部",
          id: "jd-1",
          isCurrent: true,
          name: "前端工程师",
          recallRank: 1,
          vectorScore: 20,
        },
        {
          aiRank: 2,
          aiReason: "具备部分全栈经验",
          aiScore: 76,
          available: true,
          code: "FS00001",
          departmentName: "研发部",
          id: "jd-2",
          isCurrent: false,
          name: "全栈工程师",
          recallRank: 2,
          vectorScore: 18,
        },
      ],
      createdAt: "2026-08-20T00:00:00.000Z",
      id: "run-1",
      selectedJobDescriptionId: "jd-1",
      selectionMethod: "ai_rerank",
      status: "succeeded",
    });
    bindResumePoolItemMock.mockResolvedValue({ ...baseDetail, jobDescriptionId: "jd-2" });

    const { root } = await renderAndFlush({ ...baseDetail, jobDescriptionId: "jd-1" });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("当前关联岗位");
      expect(document.body.textContent).toContain("改绑到此岗位");
      expect(document.body.textContent).toContain("AI 分 88");
      expect(document.body.textContent).toContain("向量分 20");
    });
    expect(fetchPublishedJobsMock).not.toHaveBeenCalled();
    const rebindButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("改绑到此岗位"),
    );
    await act(async () => {
      rebindButton?.click();
      await Promise.resolve();
    });
    expect(bindResumePoolItemMock).toHaveBeenCalledWith("test-slug", "resume-1", "jd-2");

    act(() => root.unmount());
  });

  it("falls back to published jobs when an exact match run only persisted the current job", async () => {
    fetchMatchResultMock.mockResolvedValue({
      candidates: [
        {
          aiRank: null,
          aiReason: null,
          aiScore: null,
          available: true,
          code: "FE00001",
          departmentName: "研发部",
          id: "jd-1",
          isCurrent: true,
          name: "前端工程师",
          recallRank: 1,
          vectorScore: null,
        },
      ],
      createdAt: "2026-08-20T00:00:00.000Z",
      id: "run-exact",
      selectedJobDescriptionId: "jd-1",
      selectionMethod: "filename_exact",
      status: "succeeded",
    });
    fetchPublishedJobsMock.mockResolvedValue(publishedJobs);

    const { root } = await renderAndFlush({ ...baseDetail, jobDescriptionId: "jd-1" });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("全栈工程师");
      expect(document.body.textContent).toContain("改绑到此岗位");
    });

    act(() => root.unmount());
  });

  it("shows an explicit empty state when no other published job can be selected", async () => {
    const [currentPublishedJob] = publishedJobs;
    if (!currentPublishedJob) {
      throw new Error("missing current published job fixture");
    }
    fetchPublishedJobsMock.mockResolvedValue([currentPublishedJob]);

    const { root } = await renderAndFlush({ ...baseDetail, jobDescriptionId: "jd-1" });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("暂无其他发布岗位");
    });

    act(() => root.unmount());
  });

  it("falls back to published jobs when an unbound resume persisted no candidates", async () => {
    fetchMatchResultMock.mockResolvedValue({
      candidates: [],
      createdAt: "2026-08-20T00:00:00.000Z",
      id: "run-empty",
      selectedJobDescriptionId: null,
      selectionMethod: null,
      status: "no_candidates",
    });
    fetchPublishedJobsMock.mockResolvedValue(publishedJobs);

    const { root } = await renderAndFlush(baseDetail);

    expect(rpcFetchMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("前端工程师");
      expect(document.body.textContent).toContain("绑定到此岗位");
    });

    act(() => root.unmount());
  });

  it("renders the disabled hint when semantic indexing is disabled", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "disabled",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("岗位推荐暂不可用");
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders the indexing hint while the job description / resume index is processing", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "indexing",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("推荐准备中");
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
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
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
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 5 },
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

  it("shows the deleted-job empty state when matched jobs were all removed", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { aboveThresholdCount: 3, eligibleCount: 0, vectorHitCount: 3 },
      recommendations: [],
      resume: { id: "resume-1" },
      status: "ready",
    });

    const { root } = await renderAndFlush(baseDetail);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("岗位已下架");
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders nothing when the resume is already matched", async () => {
    rpcFetchMock.mockResolvedValue({
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
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
