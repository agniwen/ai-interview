// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { HumanMeetingReview } from "./human-meeting-review";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const evaluation = {
  detailedAnalysis: "服务端详细分析",
  evidenceTurnIds: [],
  overallEvaluation: "服务端整体评价",
  professionalSkill: "优",
  rating: "A" as const,
  risks: "服务端风险",
  rolePosition: "服务端角色",
  salaryRecommendation: "",
  seniorityPosition: "服务端职级",
  strengths: "服务端优势",
};

function reviewRecord(
  overrides: Partial<HumanInterviewReviewRecord> = {},
): HumanInterviewReviewRecord {
  return {
    evaluation,
    evaluationError: null,
    evaluationStatus: "draft",
    evaluationUpdatedAt: "2026-08-31T00:00:00.000Z",
    evaluationUpdatedBy: "user-1",
    meetingSessionId: "session-1",
    outcome: "inconclusive",
    roundId: "round-1",
    roundStatus: "pending",
    transcript: {
      basedOnRevisionId: null,
      createdAt: "2026-08-31T00:00:00.000Z",
      createdBy: null,
      id: "00000000-0000-4000-8000-000000000001",
      kind: "final",
      language: "zh-CN",
      model: "qwen",
      provider: "qwen",
      region: "cn-beijing",
      revision: 1,
      turns: [
        {
          confidence: 0.9,
          endMs: 1000,
          id: "turn-1",
          sequence: 0,
          speakerDisplayName: "候选人",
          speakerKey: "remote-1",
          startMs: 0,
          text: "服务端转录",
          track: "remote",
        },
      ],
    },
    transcriptionError: null,
    transcriptionState: "ready",
    ...overrides,
  };
}

const roots: ReturnType<typeof createRoot>[] = [];
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

async function renderReview() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<HumanMeetingReview active inviteToken="invite-1" />));
  await flush();
  expect(container.textContent).toContain("面试评价");
  return container;
}

function change(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  if (element instanceof HTMLSelectElement) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
      element,
      value,
    );
  } else if (element instanceof HTMLTextAreaElement) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      element,
      value,
    );
  } else {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  }
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? "change" : "input", {
      bubbles: true,
    }),
  );
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

beforeEach(() => {
  vi.useFakeTimers();
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
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HumanMeetingReview", () => {
  it("keeps an unsaved round outcome across polling refreshes", async () => {
    const container = await renderReview();
    const outcome = [...container.querySelectorAll<HTMLSelectElement>("select")].find((select) =>
      [...select.options].some((option) => option.text === "通过"),
    );
    if (!outcome) {
      throw new Error("找不到本轮结论选择器");
    }

    act(() => change(outcome, "pass"));
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(outcome.value).toBe("pass");
  });

  it("does not show the meeting transcript in the evaluation flow", async () => {
    const container = await renderReview();

    expect(container.textContent).not.toContain("会议转录");
    expect(container.textContent).not.toContain("服务端转录");
    expect(container.textContent).not.toContain("人工补录完整对话");
    expect(container.textContent).not.toContain("保存草稿");
  });

  it("binds the final evaluation submission to the reviewed transcript revision", async () => {
    const container = await renderReview();

    act(() => button(container, "保存评价").click());
    await flush();

    const submitCall = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-submit"),
    );
    expect(JSON.parse(String(submitCall?.[1]?.body))).toMatchObject({
      transcriptRevisionId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("shows a stable completed state after submitting the evaluation", async () => {
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
    const container = await renderReview();
    const outcome = [...container.querySelectorAll<HTMLSelectElement>("select")].find((select) =>
      [...select.options].some((option) => option.text === "通过"),
    );
    if (!outcome) {
      throw new Error("找不到本轮结论选择器");
    }

    act(() => change(outcome, "pass"));
    act(() => button(container, "保存评价").click());
    await flush();

    expect(container.textContent).toContain("本轮评价已保存 · 通过");
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].some(
        (candidate) => candidate.textContent?.trim() === "保存评价",
      ),
    ).toBe(false);
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

  it("waits for background processing before the evaluation can be saved", async () => {
    currentReview = reviewRecord({
      evaluation: null,
      evaluationStatus: "not_started",
      meetingSessionId: null,
      transcript: null,
      transcriptionState: "pending",
    });

    const container = await renderReview();

    expect(button(container, "保存评价").disabled).toBe(true);
    expect(container.textContent).toContain("正在整理会议内容并生成评价");
    expect(container.textContent).not.toContain("使用实时字幕生成评价");
  });
});
