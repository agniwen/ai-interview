// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";
import { createRoot } from "react-dom/client";
import { expect, it, beforeEach, afterEach, vi } from "vitest";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pdfLifecycle = vi.hoisted(() => ({ destroyed: vi.fn(), mounted: vi.fn() }));
// oxlint-disable-next-line anti-slop/no-module-mocking -- Reproduce PDF worker cleanup at the viewer boundary without loading a worker in jsdom.
vi.mock("@/components/ui/pdf-viewer", () => ({
  PDFViewer: ({ toolbarActions }: { toolbarActions?: ReactNode }) => {
    useEffect(() => {
      pdfLifecycle.mounted();
      return () => pdfLifecycle.destroyed();
    }, []);
    return <div data-testid="pdf-worker-view">PDF{toolbarActions}</div>;
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
      aiEvaluation:
        id === "candidate-1"
          ? {
              evaluation: {
                conciseOverall: "不展示的简要评价",
                detailedOverall: {
                  judgment: "**符合岗位职责**",
                  matchingEvidence: "- 有相关项目成果",
                  risks: "团队管理经验待确认",
                },
                dimensions: Object.fromEntries(
                  [
                    "skillMatch",
                    "experienceRelevance",
                    "projectMatch",
                    "educationBackground",
                    "potential",
                    "stability",
                  ].map((key) => [
                    key,
                    { basis: "job", evaluation: "不展示的六维详情", level: "recommended" },
                  ]),
                ),
                recommendationLevel: "recommended",
                schemaVersion: 2,
              },
              status: "ready",
            }
          : { evaluation: null, status: "missing" },
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
            state={{ candidateId, questionsOpen: false }}
          />
        </QueryClientProvider>,
      ),
    );
  try {
    await render("candidate-1");
    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[aria-label="候选人概览"]')).not.toBeNull();
    expect(container.textContent).toContain("第一位候选人的优势");
    const aiSection = container.querySelector('[data-evaluation-id="ai-evaluation"]');
    expect(
      [...(aiSection?.querySelectorAll("section > h3") ?? [])].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["判断", "匹配依据", "风险与待确认项"]);
    expect(aiSection?.querySelector("strong")?.textContent).toBe("符合岗位职责");
    expect(aiSection?.querySelector("li")?.textContent).toBe("有相关项目成果");
    expect(aiSection?.textContent).toContain("团队管理经验待确认");
    expect(aiSection?.textContent).not.toContain("不展示的");
    expect(aiSection?.querySelector(":scope section svg")).toBeNull();
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
            state={{ candidateId: "stale-candidate", questionsOpen: false }}
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

function Harness({
  showQuestions = false,
  headerActionsContainer,
}: {
  showQuestions?: boolean;
  headerActionsContainer?: HTMLElement | null;
}) {
  const [state, setState] = useState<InterviewerCandidateMaterialsState>({
    candidateId: "candidate",
    questionsOpen: false,
  });
  return (
    <InterviewerCandidateMaterials
      active={false}
      headerActionsContainer={headerActionsContainer}
      inviteToken="unified"
      showQuestions={showQuestions}
      state={state}
      onStateChange={setState}
    />
  );
}

it("keeps the questions toggle in the header on desktop and mobile", async () => {
  vi.stubGlobal("innerWidth", 1280);
  const client = new QueryClient();
  client.setQueryData(["human-interview-candidate-materials", "unified", "candidates"], {
    candidates: [{ candidateName: "张三", id: "candidate", rounds: [], targetRole: null }],
    meetingId: "meeting",
  });
  const container = document.createElement("div");
  const headerTabs = document.createElement("div");
  const materials = document.createElement("div");
  container.append(headerTabs, materials);
  document.body.append(container);
  const root = createRoot(materials);
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness headerActionsContainer={headerTabs} showQuestions />
        </QueryClientProvider>,
      ),
    );
    const toggle = headerTabs.querySelector<HTMLButtonElement>("button[aria-expanded]");
    expect(toggle?.textContent).toContain("面试题");
    expect(materials.querySelector('[role="tablist"]')).toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    await act(() => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      materials.querySelector('section[aria-label="面试题"]')?.getAttribute("aria-hidden"),
    ).toBe("false");
    await act(() => toggle?.click());
    vi.stubGlobal("innerWidth", 390);
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness headerActionsContainer={headerTabs} showQuestions />
        </QueryClientProvider>,
      ),
    );
    expect(headerTabs.querySelector('button[aria-label="面试题"]')).not.toBeNull();
    expect(materials.querySelector('button[aria-label="面试题"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  }
});

it.each([
  { showQuestions: false, width: 390 },
  { showQuestions: false, width: 1280 },
  { showQuestions: true, width: 390 },
  { showQuestions: true, width: 1280 },
])(
  "keeps the overview mounted while toggling questions at width $width with questions=$showQuestions",
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
        canEditQuestions: true,
        interviewQuestions: [
          {
            difficulty: "medium",
            dimension: "business",
            order: 1,
            question: "请介绍一次性能优化实践",
          },
        ],
        questionHistory: [],
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
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      const overview = container.querySelector<HTMLElement>('[aria-label="候选人概览"]');
      expect(overview).not.toBeNull();
      if (overview) {
        overview.scrollTop = 137;
      }
      const toggle = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
      expect(Boolean(toggle)).toBe(showQuestions);
      const panel = container.querySelector('section[aria-label="面试题"]');
      if (width >= 768 && showQuestions) {
        expect(panel?.getAttribute("aria-hidden")).toBe("true");
      }
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      if (showQuestions) {
        await act(() => {
          toggle?.focus();
          toggle?.click();
        });
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        const questions = width < 768 ? document.querySelector('[role="dialog"]') : panel;
        expect(questions).not.toBeNull();
        expect(questions?.textContent).toContain("请介绍一次性能优化实践");
        if (width >= 768) {
          expect(panel?.getAttribute("aria-hidden")).toBe("false");
          expect(document.querySelector('[role="dialog"]')).toBeNull();
        } else {
          expect(questions?.querySelector("[data-vaul-no-drag]")).not.toBeNull();
        }
        await act(() =>
          questions?.querySelector<HTMLButtonElement>('button[aria-label="关闭面试题"]')?.click(),
        );
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(toggle);
      }
      expect(container.querySelector('[aria-label="候选人概览"]')).toBe(overview);
      expect(overview?.scrollTop).toBe(137);
    } finally {
      await act(() => root.unmount());
      client.clear();
      container.remove();
    }
  },
);

it.each([390, 1280])(
  "opens resume details in a modal at width %s and preserves viewer controls",
  async (width) => {
    vi.stubGlobal("innerWidth", width);
    const client = new QueryClient();
    const prefix = ["human-interview-candidate-materials", "unified"];
    client.setQueryData([...prefix, "candidates"], {
      candidates: [{ candidateName: "张三", id: "candidate", rounds: [], targetRole: null }],
      meetingId: "meeting",
    });
    client.setQueryData([...prefix, "candidate", "history"], {
      hrInitialInformation: null,
      previousEvaluations: [],
    });
    client.setQueryData([...prefix, "candidate", "ai-evaluation"], {
      aiEvaluation: { status: "missing" },
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
      await act(() =>
        root.render(
          <QueryClientProvider client={client}>
            <Harness />
          </QueryClientProvider>,
        ),
      );
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      const preview = container.querySelector('[aria-label="简历预览"]');
      const pdf = preview?.querySelector('[data-testid="pdf-worker-view"]');
      expect(pdf).not.toBeNull();
      await act(() =>
        preview?.querySelector<HTMLButtonElement>('button[aria-label="全屏查看简历"]')?.click(),
      );
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("简历详情");
      expect(dialog?.querySelector("[data-vaul-no-drag]")).not.toBeNull();
      const toggle = () => dialog?.querySelector<HTMLButtonElement>("button[aria-pressed]");
      expect(toggle()?.getAttribute("aria-label")).toBe("展示结构化数据");
      await act(() => toggle()?.click());
      expect(dialog?.textContent).toContain("候选人信息");
      expect(toggle()?.getAttribute("aria-label")).toBe("查看简历原件");
      await act(() => toggle()?.click());
      expect(dialog?.querySelector('[data-testid="pdf-worker-view"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="候选人概览"]')).not.toBeNull();
      const close = dialog?.querySelector<HTMLButtonElement>('button[aria-label="关闭简历详情"]');
      expect(close).not.toBeNull();
      await act(() => close?.click());
      expect(container.querySelector('[data-testid="pdf-worker-view"]')).toBe(pdf);
    } finally {
      await act(() => root.unmount());
      client.clear();
      container.remove();
    }
  },
);
