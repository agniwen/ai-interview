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

async function renderReview(onClose = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<HumanMeetingReview active inviteToken="invite-1" onClose={onClose} />));
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

function chooseOutcome(container: HTMLElement, value = "pass") {
  const select = container.querySelector<HTMLSelectElement>("select:has(option[value=pass])");
  if (!select) {
    throw new Error("找不到结论选择器");
  }
  act(() => change(select, value));
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
  it("requires an explicit final outcome but still allows saving a draft", async () => {
    const container = await renderReview();
    act(() => button(container, "提交").click());
    await flush();
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).endsWith("/evaluation-submit")),
    ).toBe(false);
    expect(button(container, "保存").disabled).toBe(false);
    const select = container.querySelector<HTMLSelectElement>("select:has(option[value=pass])");
    if (!select) {
      throw new Error("找不到结论选择器");
    }
    expect(select.value).toBe("");
    expect([...select.options].some((option) => option.value === "inconclusive")).toBe(false);
  });
  it("allows the interviewer to close the review and explains that AI evaluation can finish later", async () => {
    currentReview = reviewRecord({ evaluationStatus: "generating" });
    const onClose = vi.fn();
    const container = await renderReview(onClose);

    expect(container.textContent).toContain(
      "AI 评价生成可能需要一些时间，你可以先关闭此页面。生成完成后，我们会通过飞书发送评价链接，请返回审核并提交最终评价。",
    );
    act(() => button(container, "关闭").click());

    expect(onClose).toHaveBeenCalledOnce();
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

  it("shows save, submit, and close actions in the requested order", async () => {
    const container = await renderReview();
    const actions = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .map((candidate) => candidate.textContent?.trim())
      .filter((label) => ["保存", "提交", "关闭"].includes(label ?? ""));

    expect(actions).toEqual(["保存", "提交", "关闭"]);
  });

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
    chooseOutcome(container);

    act(() => button(container, "提交").click());
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

    act(() => button(container, "保存").click());
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

    expect(button(container, "保存").disabled).toBe(false);
    expect(button(container, "提交").disabled).toBe(false);

    act(() => button(container, "保存").click());
    await flush();
    const saveCall = fetchMock.mock.calls.find(([request]) =>
      String(request).endsWith("/evaluation-draft"),
    );
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      transcriptRevisionId: null,
    });

    chooseOutcome(container, "fail");
    act(() => button(container, "提交").click());
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
    const outcome = [...container.querySelectorAll<HTMLSelectElement>("select")].find((select) =>
      [...select.options].some((option) => option.text === "通过"),
    );
    if (!outcome) {
      throw new Error("找不到本轮结论选择器");
    }

    act(() => change(outcome, "pass"));
    act(() => button(container, "提交").click());
    await flush();

    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the review and edits open while submitting and after a failure", async () => {
    const onClose = vi.fn();
    const container = await renderReview(onClose);
    chooseOutcome(container);
    const field = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!field) {
      throw new Error("找不到评价输入框");
    }
    act(() => change(field, "面试官手动填写的内容"));
    const submission = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => submission.promise);

    act(() => button(container, "提交").click());
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(button(container, "提交").disabled).toBe(true);

    act(() => {
      submission.resolve(Response.json({ error: "提交失败" }, { status: 500 }));
    });
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(field.value).toBe("面试官手动填写的内容");
    expect(button(container, "提交").disabled).toBe(false);
  });

  it("does not close after saving a draft", async () => {
    const onClose = vi.fn();
    const container = await renderReview(onClose);
    act(() => button(container, "保存").click());
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

  it("waits for background processing before the evaluation can be saved", async () => {
    currentReview = reviewRecord({
      evaluation: null,
      evaluationStatus: "not_started",
      meetingSessionId: null,
      transcript: null,
      transcriptionState: "pending",
    });

    const container = await renderReview();

    expect(button(container, "保存").disabled).toBe(true);
    expect(button(container, "提交").disabled).toBe(true);
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
