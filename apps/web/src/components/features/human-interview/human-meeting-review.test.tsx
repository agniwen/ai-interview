// @vitest-environment jsdom

import { act } from "react";
import { setTimeout as delay } from "node:timers/promises";
import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { HumanMeetingReview } from "./human-meeting-review";
import { HumanInterviewReviewDialog } from "../studio/human-interview-review-dialog";

import { evaluation, reviewRecord } from "./human-meeting-review.test-fixtures";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReturnType<typeof createRoot>[] = [];
const browserHistories: ReturnType<typeof createBrowserHistory>[] = [];
let currentReview: HumanInterviewReviewRecord;
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: HumanInterviewReviewRecord | { ok: true }, status = 200) {
  return Promise.resolve(Response.json(body, { status }));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderInRouter(
  root: ReturnType<typeof createRoot>,
  content: ReactNode,
  useBrowserHistory = false,
) {
  const rootRoute = createRootRoute();
  const reviewRoute = createRoute({
    component: () => content,
    getParentRoute: () => rootRoute,
    path: "/review",
  });
  const listRoute = createRoute({
    component: () => <div>招聘台</div>,
    getParentRoute: () => rootRoute,
    path: "/list",
  });
  const history = useBrowserHistory
    ? createBrowserHistory()
    : createMemoryHistory({ initialEntries: ["/list", "/review"] });
  if (useBrowserHistory) {
    browserHistories.push(history);
    history.replace("/list");
    history.flush();
    history.push("/review");
    history.flush();
  }
  const router = createRouter({
    history,
    routeTree: rootRoute.addChildren([reviewRoute, listRoute]),
  });
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
  await flush();
  return router;
}

async function renderReview(onClose = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await renderInRouter(
    root,
    <HumanMeetingReview active inviteToken="invite-1" onClose={onClose} />,
  );
  await flush();
  expect(container.textContent).toContain("面试评价");
  return container;
}

type EvaluationEditorElement = HTMLElement & { editor: Editor };

async function evaluationField(container: ParentNode) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const field = container.querySelector<EvaluationEditorElement>(
      '[aria-label="整体评价"] .tiptap',
    );
    if (field) {
      return field;
    }
    await act(async () => {
      await delay(10);
    });
  }
  throw new Error("找不到评价编辑器");
}

function change(element: EvaluationEditorElement, value: string) {
  element.editor.commands.setContent(value);
}

function button(container: HTMLElement, label: string) {
  const match = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!match) {
    throw new Error(`找不到按钮：${label}`);
  }
  return match;
}

function outcomeTrigger(container: ParentNode) {
  const trigger = container.querySelector<HTMLButtonElement>(
    '[role="combobox"][aria-label="本轮结论"]',
  );
  if (!trigger) {
    throw new Error("找不到结论选择器");
  }
  return trigger;
}

async function openOutcome(container: HTMLElement) {
  await act(() => outcomeTrigger(container).click());
  await flush();
}

async function chooseOutcome(container: HTMLElement, value = "pass") {
  await openOutcome(container);
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) =>
      (item.getAttribute("aria-label") ?? item.textContent?.trim()) ===
      (value === "pass" ? "通过" : "不通过"),
  );
  if (!option) {
    throw new Error("找不到结论选项");
  }
  await act(() => option.click());
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("scrollTo", vi.fn());
  currentReview = reviewRecord();
  fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "POST" ? jsonResponse({ ok: true }) : jsonResponse(currentReview),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  for (const history of browserHistories.splice(0)) {
    history.destroy();
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HumanMeetingReview", () => {
  it("shows all required errors inline and clears corrected fields", async () => {
    currentReview = reviewRecord({ evaluation: null });
    const container = await renderReview();
    const editor = await evaluationField(container);
    act(() => button(container, "提交评价").click());
    await flush();
    expect(container.querySelectorAll('[data-slot="field-error"]')).toHaveLength(2);
    expect(container.textContent).toContain("请选择本轮结论：通过或不通过");
    expect(container.textContent).toContain("请选择评级");
    expect(container.textContent).not.toContain("请填写整体评价");
    expect(outcomeTrigger(container).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(outcomeTrigger(container));
    expect(container.querySelector('[aria-label="整体评价"]')?.getAttribute("aria-invalid")).toBe(
      "false",
    );
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
    await chooseOutcome(container);
    act(() => change(editor, "有依据的整体评价"));
    expect(outcomeTrigger(container).getAttribute("aria-invalid")).toBe("false");
    expect(container.querySelectorAll('[data-slot="field-error"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("请填写整体评价");
  });

  it("saves and reloads an unrated draft but requires a rating before submission", async () => {
    currentReview = reviewRecord({ evaluation: null });
    const container = await renderReview();
    await evaluationField(container);
    const rating = container.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="评级"]',
    );
    expect(rating?.textContent).toContain("请选择评级");
    await chooseOutcome(container);
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        currentReview = reviewRecord({ evaluation: JSON.parse(String(init.body)).evaluation });
        return jsonResponse({ ok: true });
      }
      return jsonResponse(currentReview);
    });
    act(() => button(container, "保存草稿").click());
    await flush();
    expect(currentReview.evaluation?.rating).toBeNull();
    expect(currentReview.evaluation?.overallEvaluation).toBe("");
    expect(currentReview.evaluation?.draftOutcome).toBe("pass");
    expect(currentReview.roundStatus).toBe("pending");
    expect(currentReview.outcome).toBe("inconclusive");
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(rating?.textContent).toContain("请选择评级");
    expect(outcomeTrigger(container).textContent).toContain("通过");
    act(() => button(container, "提交评价").click());
    await flush();
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
    expect(document.activeElement).toBe(rating);
    await act(() => rating?.click());
    expect(
      [...document.querySelectorAll('[role="option"]')]
        .map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim())
        .filter((label) => label !== "通过" && label !== "不通过"),
    ).toEqual(["A", "B", "C", "D"]);
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (item) => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === "A",
    );
    if (!option) {
      throw new Error("找不到评级选项");
    }
    await act(() => option.click());
    act(() => button(container, "提交评价").click());
    await flush();
    const submitted = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-submit"),
    );
    expect(JSON.parse(String(submitted?.[1]?.body)).evaluation.rating).toBe("A");
    expect(JSON.parse(String(submitted?.[1]?.body)).evaluation.overallEvaluation).toBe("");
    expect(JSON.parse(String(submitted?.[1]?.body)).evaluation).not.toHaveProperty("draftOutcome");
  });

  it("saves multiline fields alongside rich text without changing untouched Markdown", async () => {
    currentReview.evaluation = { ...evaluation, professionalSkill: "**专业技能**\n- 原有内容" };
    const container = await renderReview();
    await evaluationField(container);
    const field = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="职级定位"]');
    if (!field) {
      throw new Error("找不到职级输入框");
    }
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        field,
        "高级工程师\n能够独立负责模块",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="完整详细分析"]')).toBeNull();
    expect(container.textContent).not.toContain("完整详细分析");
    act(() => button(container, "保存草稿").click());
    await flush();
    const save = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-draft"),
    );
    expect(JSON.parse(String(save?.[1]?.body)).evaluation).toMatchObject({
      detailedAnalysis: "服务端详细分析",
      professionalSkill: "**专业技能**\n- 原有内容",
      seniorityPosition: "高级工程师\n能够独立负责模块",
    });
  });

  it("marks the fields required for saving or submitting a review", async () => {
    const container = await renderReview();

    expect(container.textContent).not.toContain("整体评价*");
    expect(container.textContent).toContain("本轮结论*");
    await evaluationField(container);
    expect(
      container.querySelector('[aria-label="整体评价"]')?.getAttribute("aria-required"),
    ).toBeNull();
    const outcome = outcomeTrigger(container);
    expect(outcome.getAttribute("aria-required")).toBe("true");
  });

  it.each(["back", "navigate"] as const)(
    "protects unsaved edits during %s navigation",
    async (navigation) => {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);
      const onClose = vi.fn();
      const router = await renderInRouter(
        root,
        <HumanMeetingReview active inviteToken="invite-1" onClose={onClose} />,
        navigation === "back",
      );
      const textarea = await evaluationField(container);
      const cleanUnload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(cleanUnload);
      expect(cleanUnload.defaultPrevented).toBe(false);
      act(() => change(textarea, "后退前的未保存评价"));
      if (navigation === "back") {
        const dirtyUnload = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(dirtyUnload);
        expect(dirtyUnload.defaultPrevented).toBe(true);
      }
      const leave = () => {
        if (navigation === "back") {
          router.history.back();
        } else {
          void router.navigate({ href: "/list" });
        }
      };
      act(leave);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      await flush();
      expect(router.state.location.pathname).toBe("/review");
      expect(document.body.textContent).toContain("放弃未保存的修改");
      act(() => button(document.body, "继续编辑").click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      await flush();
      expect(textarea.textContent).toBe("后退前的未保存评价");
      act(leave);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      await flush();
      act(() => button(document.body, "放弃修改并关闭").click());
      await flush();
      expect(router.state.location.pathname).toBe("/list");
      expect(container.textContent).toBe("招聘台");
      expect(onClose).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    },
  );

  it.each(["保存草稿", "提交评价"] as const)(
    "allows navigation after successful %s",
    async (action) => {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);
      const onClose = vi.fn();
      const router = await renderInRouter(
        root,
        <HumanMeetingReview active inviteToken="invite-1" onClose={onClose} />,
        true,
      );
      onClose.mockImplementation(() => router.history.back());
      const textarea = await evaluationField(container);
      act(() => change(textarea, "保存后的评价"));
      if (action === "提交评价") {
        await chooseOutcome(container);
      }
      act(() => button(container, action).click());
      await flush();
      if (action === "保存草稿") {
        expect(onClose).not.toHaveBeenCalled();
        act(() => router.history.back());
      } else {
        expect(onClose).toHaveBeenCalledOnce();
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      await flush();
      expect(router.state.location.pathname).toBe("/list");
      expect(container.textContent).toBe("招聘台");
      expect(document.body.textContent).not.toContain("放弃未保存的修改");
    },
  );

  it("keeps the system dialog open when its close icon encounters unsaved edits", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      media: query,
      removeEventListener: vi.fn(),
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const onClose = vi.fn();
    await renderInRouter(
      root,
      <HumanInterviewReviewDialog
        candidateId="candidate"
        candidateName="候选人"
        roundId="round"
        roundLabel="业务一面"
        slug="team"
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    await flush();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("面试评价 · 候选人 · 业务一面");
    const textarea = await evaluationField(document);
    act(() => change(textarea, "未保存修改"));
    act(() => button(document.body, "Close").click());
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("放弃未保存的修改");
    act(() => button(document.body, "继续编辑").click());
    expect(textarea.textContent).toBe("未保存修改");
    act(() => button(document.body, "关闭").click());
    act(() => button(document.body, "放弃修改并关闭").click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it("uses the system review endpoint and stays open after saving", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const onClose = vi.fn();
    const onSaved = vi.fn();
    await renderInRouter(
      root,
      <HumanMeetingReview
        active
        basePath="/api/w/team/studio/interviews/candidate/human-interview-rounds/review/round"
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/w/team/studio/interviews/candidate/human-interview-rounds/review/round/review",
      expect.anything(),
    );
    act(() => button(container, "保存草稿").click());
    await flush();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requires an explicit final outcome but still allows saving a draft", async () => {
    const container = await renderReview();
    act(() => button(container, "提交评价").click());
    await flush();
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
    expect(button(container, "保存草稿").disabled).toBe(false);
    expect(outcomeTrigger(container).textContent).toContain("请选择通过或不通过");
    await openOutcome(container);
    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.getAttribute("aria-label") ?? option.textContent?.trim(),
      ),
    ).toEqual(["通过", "不通过"]);
  });
  it("explains that AI evaluation can finish after leaving the page", async () => {
    currentReview = reviewRecord({ evaluationStatus: "generating" });
    const onClose = vi.fn();
    const container = await renderReview(onClose);

    expect(container.textContent).not.toContain("重新生成");
    expect(container.textContent).toContain(
      "AI 评价生成可能需要一些时间，你可以先离开页面。生成完成后，我们会通过飞书发送评价链接，请返回审核并提交最终评价。",
    );
    expect(
      [...container.querySelectorAll("button")].some(
        (item) => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === "关闭",
      ),
    ).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not show the AI waiting hint after evaluation generation fails", async () => {
    currentReview = reviewRecord({
      evaluationError: "AI 评价生成失败",
      evaluationStatus: "failed",
    });

    const container = await renderReview();

    expect(container.textContent).toContain("AI 评价生成失败");
    expect(container.textContent).not.toContain("AI 评价生成可能需要一些时间");
  });

  it("shows only save and submit actions on the standalone page", async () => {
    const container = await renderReview();
    const actions = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .map((candidate) => candidate.textContent?.trim())
      .filter((label) => ["保存草稿", "提交评价", "关闭"].includes(label ?? ""));

    expect(actions).toEqual(["保存草稿", "提交评价"]);
  });

  it("keeps an unsaved round outcome across polling refreshes", async () => {
    const container = await renderReview();
    const outcome = outcomeTrigger(container);

    await chooseOutcome(container);
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(outcome.textContent).toContain("通过");
  });

  it("does not show the meeting transcript in the evaluation flow", async () => {
    const container = await renderReview();

    expect(container.textContent).not.toContain("会议转录");
    expect(container.textContent).not.toContain("服务端转录");
    expect(container.textContent).not.toContain("人工补录完整对话");
    expect(container.textContent).not.toContain("保存转录");
  });

  it("shows uncertain recovery speech only on request without disabling manual submission", async () => {
    if (!currentReview.transcript) {
      throw new Error("fixture missing transcript");
    }
    const [turn] = currentReview.transcript.turns;
    if (!turn) {
      throw new Error("fixture missing turn");
    }
    turn.attribution = {
      method: "unconfirmed",
      participantIdentity: null,
      role: "unknown",
      sourceId: "mixed",
    };
    const container = await renderReview();
    expect(container.textContent).toContain("1 段发言待确认身份");
    expect(container.textContent).not.toContain("服务端转录");
    act(() => button(container, "查看待确认片段").click());
    expect(container.textContent).toContain("服务端转录");
    expect(button(container, "提交评价").disabled).toBe(false);
    act(() => button(container, "候选人").click());
    const confirmation = button(container, "确认所选身份");
    expect(confirmation.disabled).toBe(false);
    act(() => confirmation.click());
    await flush();
    const call = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/transcript-attribution"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      assignments: [{ role: "candidate", turnId: turn.id }],
      sourceRevisionId: currentReview.transcript.id,
    });
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
  });

  it("binds the final evaluation submission to the reviewed transcript revision", async () => {
    const container = await renderReview();
    await chooseOutcome(container);

    act(() => button(container, "提交评价").click());
    await flush();

    const submitCall = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-submit"),
    );
    expect(JSON.parse(String(submitCall?.[1]?.body))).toMatchObject({
      transcriptRevisionId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("saves an evaluation draft without submitting the round outcome", async () => {
    const container = await renderReview();

    act(() => button(container, "保存草稿").click());
    await flush();

    const saveCall = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-draft"),
    );
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      evaluation,
      transcriptRevisionId: "00000000-0000-4000-8000-000000000001",
    });
    expect(JSON.parse(String(saveCall?.[1]?.body))).not.toHaveProperty("outcome");
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
  });

  it("allows manual save and submission when transcription failed", async () => {
    currentReview = reviewRecord({
      evaluationStatus: "failed",
      meetingSessionId: null,
      transcript: null,
      transcriptionError: "录音转录失败",
      transcriptionState: "failed",
    });
    const container = await renderReview();

    expect(button(container, "保存草稿").disabled).toBe(false);
    expect(button(container, "提交评价").disabled).toBe(false);

    act(() => button(container, "保存草稿").click());
    await flush();
    const saveCall = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-draft"),
    );
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      transcriptRevisionId: null,
    });

    await chooseOutcome(container, "fail");
    act(() => button(container, "提交评价").click());
    await flush();
    const submitCall = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-submit"),
    );
    expect(JSON.parse(String(submitCall?.[1]?.body))).toMatchObject({
      transcriptRevisionId: null,
    });
  });

  it("closes after submitting the evaluation without waiting for a refresh", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).endsWith("/evaluation-submit")) {
        currentReview = reviewRecord({
          evaluationStatus: "submitted",
          outcome: "pass",
          roundStatus: "completed",
        });
        return jsonResponse({ ok: true });
      }
      return jsonResponse(currentReview);
    });
    const onClose = vi.fn();
    const container = await renderReview(onClose);

    await chooseOutcome(container);
    act(() => button(container, "提交评价").click());
    await flush();

    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the review and edits open while submitting and after a failure", async () => {
    const onClose = vi.fn();
    const container = await renderReview(onClose);
    await chooseOutcome(container);
    const field = await evaluationField(container);
    if (!field) {
      throw new Error("找不到评价输入框");
    }
    act(() => change(field, "面试官手动填写的内容"));
    const submission = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => submission.promise);

    act(() => button(container, "提交评价").click());
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(button(container, "提交评价").disabled).toBe(true);

    act(() => {
      submission.resolve(Response.json({ error: "提交失败" }, { status: 500 }));
    });
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(field.textContent).toBe("面试官手动填写的内容");
    expect(button(container, "提交评价").disabled).toBe(false);
  });

  it("does not close after saving a draft", async () => {
    const onClose = vi.fn();
    const container = await renderReview(onClose);
    act(() => button(container, "保存草稿").click());
    await flush();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps an empty transcript revision hidden from the evaluation flow", async () => {
    const emptyReview = reviewRecord();
    if (!emptyReview.transcript) {
      throw new Error("测试数据缺少转录版本");
    }
    currentReview = { ...emptyReview, transcript: { ...emptyReview.transcript, turns: [] } };

    const container = await renderReview();

    expect(container.textContent).not.toContain("人工补录完整对话");
    expect(container.textContent).not.toContain("会议转录");
  });

  it("allows manual submission validation while waiting for background processing", async () => {
    currentReview = reviewRecord({
      evaluation: null,
      evaluationStatus: "not_started",
      meetingSessionId: null,
      transcript: null,
      transcriptionState: "pending",
    });

    const container = await renderReview();

    expect(button(container, "保存草稿").disabled).toBe(true);
    expect(button(container, "提交评价").disabled).toBe(false);
    expect(container.textContent).toContain("正在整理会议内容并生成评价");
    expect(container.textContent).not.toContain("使用实时字幕生成评价");
  });
});

describe("confirmed evaluation document sync", () => {
  it("shows a failed sync while keeping the submitted evaluation locked and allows retry", async () => {
    currentReview = reviewRecord({
      documentSync: {
        documentUrl: "https://feishu.cn/docx/doc-1",
        status: "failed",
        syncedAt: null,
      },
      evaluationStatus: "submitted",
      roundStatus: "completed",
    });
    const container = await renderReview();
    expect(container.textContent).toContain("飞书评价表同步失败");
    expect(
      [...container.querySelectorAll("textarea")].every(
        (field) => field.disabled || field.readOnly,
      ),
    ).toBe(true);
    act(() => button(container, "重试同步").click());
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/evaluation-document-retry"),
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("shows the synced target document link", async () => {
    currentReview = reviewRecord({
      documentSync: {
        documentUrl: "https://feishu.cn/docx/doc-1",
        status: "synced",
        syncedAt: "2026-09-02T03:00:00Z",
      },
      evaluationStatus: "submitted",
      roundStatus: "completed",
    });
    const container = await renderReview();
    expect(container.textContent).toContain("已同步到飞书评价表");
    expect(container.querySelector('a[href="https://feishu.cn/docx/doc-1"]')?.textContent).toBe(
      "查看评价表",
    );
    expect(container.textContent).not.toContain("重试同步");
  });
});
