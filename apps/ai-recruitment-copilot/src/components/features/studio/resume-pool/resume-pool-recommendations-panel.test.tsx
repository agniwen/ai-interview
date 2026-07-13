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
  rpcFetch: rpcFetchMock,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const baseDetail = {
  id: "resume-1",
  jobDescriptionId: null,
} as unknown as ResumePoolDetail;

function renderPanel() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { container, queryClient, root };
}

async function renderAndFlush(detail: ResumePoolDetail) {
  const { queryClient, root } = renderPanel();
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ResumePoolRecommendationsPanel detail={detail} slug="test-slug" />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  return { queryClient, root };
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

  it("renders Top-N cards with name, score, reasons and a match button when ready", async () => {
    const onMatch = vi.fn();
    rpcFetchMock.mockResolvedValue({
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
    });

    const { queryClient, root } = renderPanel();
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ResumePoolRecommendationsPanel detail={baseDetail} onMatch={onMatch} slug="test-slug" />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("高级后端工程师");
    });

    expect(document.body.textContent).toContain("87");
    expect(document.body.textContent).toContain("技能高度匹配");

    const matchButton = [...document.querySelectorAll("button")].find(
      (btn) => btn.textContent === "匹配到此岗位",
    );
    expect(matchButton).not.toBeUndefined();

    act(() => {
      matchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onMatch).toHaveBeenCalledWith("jd-1");

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
});
