// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useState } from "react";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";
import { createRoot } from "react-dom/client";
import { expect, it, beforeEach, afterEach, vi } from "vitest";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    client.setQueryData([...prefix, id, "questions"], { interviewQuestions: [] });
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
            state={{ candidateId, tab: "hr" }}
          />
        </QueryClientProvider>,
      ),
    );
  try {
    await render("candidate-1");
    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
    const selectedTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(selectedTab?.textContent).toBe("历史评价");
    expect(container.textContent).toContain("第一位候选人的优势");
    await render("candidate-2");
    expect(container.textContent).not.toContain("第一位候选人的优势");
    expect(container.textContent).toContain("暂无已提交的业务面评价");
    expect(container.querySelector('button[aria-expanded="true"]')?.textContent).toBe("HR 初面");
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
            state={{ candidateId: "stale-candidate", tab: "ai" }}
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

function Harness() {
  const [state, setState] = useState<InterviewerCandidateMaterialsState>({
    candidateId: "candidate",
    tab: "resume",
  });
  return (
    <InterviewerCandidateMaterials
      active={false}
      inviteToken="unified"
      state={state}
      onStateChange={setState}
    />
  );
}

it.each([390, 1280])("uses one ordered materials tab group at width %s", async (width) => {
  vi.stubGlobal("innerWidth", width);
  const client = new QueryClient();
  client.setQueryData(["human-interview-candidate-materials", "unified", "candidates"], {
    candidates: [{ candidateName: "张三", id: "candidate", rounds: [], targetRole: null }],
    meetingId: "meeting",
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
    expect(container.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "简历",
      "详情",
      "AI 评价",
      "面试题",
      "历史评价",
    ]);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("简历");
    for (const tab of tabs) {
      await act(() => tab.click());
      expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
        tab.textContent,
      );
      expect(container.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
    }
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  }
});
