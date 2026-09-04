// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
            state={{ candidateId, centerTab: "detail", leftTab: "hr" }}
          />
        </QueryClientProvider>,
      ),
    );
  try {
    await render("candidate-1");
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
