// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { HumanMeetingReview } from "./human-meeting-review";
import {
  button,
  evaluation,
  evaluationField,
  reviewRecord,
} from "./human-meeting-review.test-fixtures";
// SAFETY: React uses this documented test-only global to enable act warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let currentReview: HumanInterviewReviewRecord;
let fetchMock: ReturnType<typeof vi.fn>;
let root: ReturnType<typeof createRoot>;
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
async function renderReview() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const route = createRootRoute({
    component: () => <HumanMeetingReview active inviteToken="reviewer" onClose={() => {}} />,
  });
  const router = createRouter({ history: createMemoryHistory(), routeTree: route });
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
  await flush();
  return container;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("scrollTo", vi.fn());
  fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(Response.json(init?.method === "POST" ? { ok: true } : currentReview)),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps my unsubmitted evaluation editable after another interviewer completes the round", async () => {
  currentReview = reviewRecord({
    evaluationStatus: "draft",
    evaluationVersion: 3,
    outcome: null,
    personalEvaluation: true,
    roundOutcome: "pass",
    roundStatus: "completed",
  });
  const container = await renderReview();
  expect(button(container, "提交评价").disabled).toBe(false);
  expect(container.textContent).toContain("当前汇总：通过");
  await act(() => button(container, "保存草稿").click());
  await flush();
  const saved = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/evaluation-draft"));
  expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({ expectedVersion: 3 });
});

it("shows AI suggestions and attributed reviews separately from my draft", async () => {
  currentReview = reviewRecord({
    aiEvaluation: { ...evaluation, overallEvaluation: "AI 原始建议" },
    evaluation: { ...evaluation, overallEvaluation: "我的草稿" },
    personalEvaluation: true,
    reviewerEvaluations: [
      {
        evaluation: { ...evaluation, overallEvaluation: "另一位的评价" },
        id: "second",
        legacy: false,
        outcome: "fail",
        reviewerId: "second",
        reviewerName: "第二面试官",
        submittedAt: "2026-10-08T00:00:00Z",
        updatedAt: "2026-10-08T00:00:00Z",
        version: 1,
      },
    ],
  });
  const container = await renderReview();
  expect(container.textContent).toContain("AI 原始建议");
  expect(container.textContent).toContain("第二面试官 · 不通过");
  expect(container.textContent).toContain("另一位的评价");
  const ownEditor = await evaluationField(container);
  expect(ownEditor.textContent).toContain("我的草稿");
  expect(container.textContent).not.toContain("使用 AI 建议作为我的草稿");
});

it.each(["pass", "fail"] as const)(
  "locks and saves the first decisive result: %s",
  async (lockedOutcome) => {
    currentReview = reviewRecord({
      evaluation: { ...evaluation, draftOutcome: "inconclusive" },
      evaluationStatus: "draft",
      lockedOutcome,
      outcome: null,
      personalEvaluation: true,
    });
    const container = await renderReview();
    const select = container.querySelector<HTMLButtonElement>('button[id$="-outcome"]');
    expect(select?.disabled).toBe(true);
    expect(select?.textContent).toContain(lockedOutcome === "pass" ? "通过" : "不通过");
    expect(button(container, "保存草稿").disabled).toBe(false);
    await act(() => button(container, "保存草稿").click());
    await flush();
    const saved = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/evaluation-draft"));
    expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({
      evaluation: { draftOutcome: lockedOutcome },
    });
  },
);
