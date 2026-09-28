// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect, useState } from "react";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";
import { createRoot } from "react-dom/client";
import { expect, it, beforeEach, afterEach, vi } from "vitest";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pdfLifecycle = vi.hoisted(() => ({ destroyed: vi.fn(), mounted: vi.fn() }));
// oxlint-disable-next-line anti-slop/no-module-mocking -- Reproduce PDF worker cleanup at the viewer boundary without loading a worker in jsdom.
vi.mock("@/components/ui/pdf-viewer", () => ({
  PDFViewer: () => {
    useEffect(() => {
      pdfLifecycle.mounted();
      return () => pdfLifecycle.destroyed();
    }, []);
    return <div data-testid="pdf-worker-view">PDF</div>;
  },
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

it("opens history from the materials tab and isolates it when switching candidates", async () => {
  const client = new QueryClient();
  const prefix = ["human-interview-candidate-materials", "invite-1"];
  client.setQueryData([...prefix, "candidates"], {
    candidates: ["candidate-1", "candidate-2"].map((id) => ({
      candidateName: id,
      id,
      rounds: [],
      targetRole: null,
    })),
    meetingId: "meeting-1",
  });
  for (const id of ["candidate-1", "candidate-2"]) {
    client.setQueryData([...prefix, id, "overview"], {
      candidate: {
        candidateEmail: null,
        candidateName: id,
        candidatePhone: null,
        creatorName: null,
        hasResumeFile: false,
        id,
        jobDescriptionName: null,
        resumeFileName: null,
        resumeProfile: null,
        targetRole: null,
      },
    });
    client.setQueryData([...prefix, id, "ai-evaluation"], {
      aiEvaluation: { evaluation: null, status: "missing" },
    });
    client.setQueryData([...prefix, id, "history"], {
      hrInitialInformation: null,
      previousEvaluations:
        id === "candidate-1"
          ? [
              {
                outcome: "pass",
                roundId: "round-1",
                roundLabel: "业务一面",
                submittedAt: null,
                submittedBy: "测试面试官",
                values: {
                  professionalSkill: "良",
                  rating: "B",
                  risks: "待核实",
                  rolePosition: "执行员工",
                  salaryRecommendation: "",
                  seniorityPosition: "执行员工",
                  strengths: "第一位候选人的优势",
                },
              },
            ]
          : [],
    });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (candidateId: string) =>
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <InterviewerCandidateMaterials
            active
            inviteToken="invite-1"
            onStateChange={() => {}}
            state={{ candidateId, tab: "evaluation" }}
          />
        </QueryClientProvider>,
      ),
    );
  try {
    await render("candidate-1");
    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
    const selectedTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(selectedTab?.textContent).toBe("评价");
    expect(container.textContent).toContain("第一位候选人的优势");
    await render("candidate-2");
    expect(container.textContent).not.toContain("第一位候选人的优势");
    expect(container.textContent).not.toContain("暂无已提交的业务面评价");
    expect(container.textContent).not.toContain("暂无 HR 初面信息");
    expect(container.textContent).not.toContain("暂无可展示的六维 AI 评价");
    expect(container.querySelector('[role="tabpanel"] button[aria-expanded]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  }
});

it("omits the redundant candidate banner even when the stored selection is stale", async () => {
  const client = new QueryClient();
  client.setQueryData(["human-interview-candidate-materials", "invite-single", "candidates"], {
    candidates: [
      {
        candidateName: "测试候选人",
        id: "candidate-only",
        rounds: [{ id: "round-only", label: "业务二面" }],
        targetRole: null,
      },
    ],
    meetingId: "meeting-single",
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <InterviewerCandidateMaterials
            active={false}
            inviteToken="invite-single"
            onStateChange={() => {}}
            state={{ candidateId: "stale-candidate", tab: "evaluation" }}
          />
        </QueryClientProvider>,
      ),
    );
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    expect(container.textContent).not.toContain("当前候选人");
    expect(container.textContent).not.toContain("业务二面");
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  }
});

function Harness({ showQuestions = false }: { showQuestions?: boolean }) {
  const [state, setState] = useState<InterviewerCandidateMaterialsState>({
    candidateId: "candidate",
    tab: "resume",
  });
  return (
    <InterviewerCandidateMaterials
      active={false}
      inviteToken="unified"
      showQuestions={showQuestions}
      state={state}
      onStateChange={setState}
    />
  );
}

it.each([
  { showQuestions: false, width: 390 },
  { showQuestions: false, width: 1280 },
  { showQuestions: true, width: 390 },
  { showQuestions: true, width: 1280 },
])(
  "uses the appropriate tabs at width $width with questions=$showQuestions",
  async ({ width, showQuestions }) => {
    vi.stubGlobal("innerWidth", width);
    const client = new QueryClient();
    client.setQueryData(["human-interview-candidate-materials", "unified", "candidates"], {
      candidates: [{ candidateName: "张三", id: "candidate", rounds: [], targetRole: null }],
      meetingId: "meeting",
    });
    client.setQueryData(
      ["human-interview-candidate-materials", "unified", "candidate", "questions"],
      {
        interviewQuestions: [
          {
            difficulty: "medium",
            dimension: "business",
            order: 1,
            question: "请介绍一次性能优化实践",
          },
        ],
      },
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          <QueryClientProvider client={client}>
            <Harness showQuestions={showQuestions} />
          </QueryClientProvider>,
        ),
      );
      expect(container.querySelectorAll('[role="tablist"]')).toHaveLength(1);
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(tabs.map((tab) => tab.textContent)).toEqual(
        showQuestions ? ["简历", "评价", "面试题"] : ["简历", "评价"],
      );
      expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
        "简历",
      );
      const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
      expect(panels).toHaveLength(tabs.length);
      const [resumePanel] = panels;
      if (resumePanel) {
        resumePanel.scrollTop = 137;
      }
      for (const tab of [...tabs, tabs[0]]) {
        await act(() => tab.click());
        expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
          tab.textContent,
        );
        expect(container.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
      }
      expect([...container.querySelectorAll('[role="tabpanel"]')]).toEqual(panels);
      expect(resumePanel?.scrollTop).toBe(137);
      expect(container.textContent?.includes("请介绍一次性能优化实践")).toBe(showQuestions);
    } finally {
      await act(() => root.unmount());
      client.clear();
      container.remove();
    }
  },
);

it("switches the resume tab between the original file and structured data", async () => {
  const client = new QueryClient();
  const prefix = ["human-interview-candidate-materials", "unified"];
  client.setQueryData([...prefix, "candidates"], {
    candidates: [{ candidateName: "张三", id: "candidate", rounds: [], targetRole: null }],
    meetingId: "meeting",
  });
  client.setQueryData([...prefix, "candidate", "overview"], {
    candidate: {
      candidateEmail: null,
      candidateName: "张三",
      candidatePhone: null,
      creatorName: null,
      hasResumeFile: false,
      id: "candidate",
      jobDescriptionName: null,
      resumeFileName: null,
      resumeProfile: null,
      targetRole: null,
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      ),
    );
    const toggle = () => container.querySelector<HTMLButtonElement>("button[aria-pressed]");
    expect(toggle()?.textContent).toBe("展示结构化数据");
    expect(container.textContent).toContain("候选人未上传简历文件");
    await act(() => toggle()?.click());
    expect(toggle()?.textContent).toBe("展示简历原件");
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("候选人信息");
    await act(() => toggle()?.click());
    expect(toggle()?.textContent).toBe("展示结构化数据");
    expect(container.textContent).toContain("候选人未上传简历文件");
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  }
});

it("keeps the PDF worker alive when switching away and back", async () => {
  pdfLifecycle.mounted.mockClear();
  pdfLifecycle.destroyed.mockClear();
  const client = new QueryClient();
  const prefix = ["human-interview-candidate-materials", "unified"];
  client.setQueryData([...prefix, "candidates"], {
    candidates: [{ candidateName: "张三", id: "candidate", rounds: [], targetRole: null }],
    meetingId: "meeting",
  });
  client.setQueryData([...prefix, "candidate", "overview"], {
    candidate: {
      candidateName: "张三",
      hasResumeFile: true,
      id: "candidate",
      resumeFileName: "resume.pdf",
      resumeProfile: null,
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    const pdf = container.querySelector('[data-testid="pdf-worker-view"]');
    expect(pdf).not.toBeNull();
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    for (const label of ["评价", "简历", "评价", "简历"]) {
      await act(() => tabs.find((tab) => tab.textContent === label)?.click());
      expect(container.querySelector('[data-testid="pdf-worker-view"]')).toBe(pdf);
      expect(pdfLifecycle.mounted).toHaveBeenCalledTimes(1);
      expect(pdfLifecycle.destroyed).not.toHaveBeenCalled();
    }
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  }
  expect(pdfLifecycle.destroyed).toHaveBeenCalledTimes(1);
});
