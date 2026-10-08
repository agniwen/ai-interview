// @vitest-environment jsdom
import { act } from "react";
import { Provider, createStore, useAtomValue, useSetAtom } from "jotai";
import { meetingReviewOpenAtom, toggleMeetingReviewAtom } from "./human-meeting-review-state";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { HumanMeetingInProgressReview } from "./human-meeting-in-progress-review";
import {
  button,
  change,
  evaluationField,
  evaluation,
  reviewRecord,
} from "./human-meeting-review.test-fixtures";
// SAFETY: React's test-only act flag belongs to the jsdom test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([false, true])(
  "saves an in-meeting draft, retains legacy content (%s), and automatically saves edits and closing",
  async (hasLegacy) => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("scrollTo", vi.fn());
    const currentReview = reviewRecord({
      evaluation: hasLegacy ? evaluation : null,
      evaluationStatus: "not_started",
      transcript: null,
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(Response.json(init?.method === "POST" ? { ok: true } : currentReview)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const store = createStore();
    store.set(meetingReviewOpenAtom, true);
    const onClose = vi.fn(() => store.set(meetingReviewOpenAtom, false));
    const workspace = document.createElement("div");
    document.body.append(workspace);
    const route = createRootRoute({
      component: function ReviewPreview() {
        const expanded = useAtomValue(meetingReviewOpenAtom);
        const toggle = useSetAtom(toggleMeetingReviewAtom);
        return (
          <>
            <button onClick={() => toggle()}>切换评价</button>
            <HumanMeetingInProgressReview
              expanded={expanded}
              container={workspace}
              inviteToken="invite-1"
              onClose={onClose}
            />
          </>
        );
      },
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: route,
    });
    await act(async () => {
      await router.load();
      root.render(
        <Provider store={store}>
          <RouterProvider router={router} />
        </Provider>,
      );
    });
    await flush();
    expect(document.body.textContent).toContain("填写后每秒自动保存");
    expect(
      document.querySelector('[data-slot="meeting-review-panel"]')?.getAttribute("aria-modal"),
    ).not.toBe("true");
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(
      [...document.querySelectorAll("button")].some((item) => item.textContent === "提交评价"),
    ).toBe(false);
    for (const [label, choice] of [
      ["本轮结论", "通过"],
      ["评级", "B"],
      ["专业技能", "良"],
    ]) {
      const trigger = document.querySelector<HTMLButtonElement>(
        `[role="combobox"][aria-label="${label}"]`,
      );
      if (!trigger) {
        throw new Error(`找不到${label}选择器`);
      }
      await act(() => trigger.click());
      await flush();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      const option = document.querySelector<HTMLElement>(`[role="option"][aria-label="${choice}"]`);
      if (!option) {
        throw new Error(`找不到${choice}选项`);
      }
      expect(option.closest('[data-slot="meeting-review-panel"]')).not.toBeNull();
      await act(() => option.click());
      expect(trigger.textContent).toContain(choice);
    }
    for (const label of ["优势特点", "劣势风险"]) {
      expect(document.querySelector(`textarea[aria-label="${label}"]`)).toBeNull();
      expect(document.body.textContent?.includes(label)).toBe(hasLegacy);
    }
    if (hasLegacy) {
      expect(document.body.textContent).toContain(evaluation.strengths);
      expect(document.body.textContent).toContain(evaluation.risks);
    }
    const editor = await evaluationField(document.body);
    act(() => change(editor, "面试过程中记录的评价"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.body.textContent).toContain("已自动保存");
    const save = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-draft"),
    );
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({
      evaluation: {
        draftOutcome: "pass",
        overallEvaluation: "面试过程中记录的评价",
        professionalSkill: "良",
        rating: "B",
        risks: hasLegacy ? evaluation.risks : "",
        strengths: hasLegacy ? evaluation.strengths : "",
      },
      transcriptRevisionId: null,
    });
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
    act(() => change(editor, "关闭时保存的最新评价"));
    await act(() => button(document.body, "关闭").click());
    expect(onClose).toHaveBeenCalledOnce();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[1]?.[1]?.body)).evaluation.overallEvaluation).toBe(
      "关闭时保存的最新评价",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(() => button(document.body, "切换评价").click());
    const reopenedEditor = await evaluationField(document.body);
    expect(reopenedEditor.textContent).toContain("关闭时保存的最新评价");
    act(() => change(reopenedEditor, "收起时保存的评价"));
    await act(() => button(document.body, "切换评价").click());
    expect(store.get(meetingReviewOpenAtom)).toBe(false);
    const collapsedSave = fetchMock.mock.calls.findLast(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(collapsedSave?.[1]?.body)).evaluation.overallEvaluation).toBe(
      "收起时保存的评价",
    );
  },
);
