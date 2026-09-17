// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { HumanInitialInterviewDetail } from "@app/shared/human-initial-interview";
import { initialInterviewSnapshotSchema } from "@app/shared/human-initial-interview";
import { InitialInterviewRecordingContent } from "./initial-interview-recording";

// SAFETY: React uses this optional flag to identify the jsdom test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const detail: HumanInitialInterviewDetail = {
  createdAt: "2026-09-08T00:00:00Z",
  id: "snapshot",
  recruitingRecordId: "candidate",
  snapshot: {
    candidateName: "候选人",
    durationMs: 2000,
    interviewQuestions: [],
    job: null,
    liveSummary: {
      captureId: "8e359c34-43ec-4a13-8472-2c835c7c1511",
      coveredThroughMs: 2000,
      coveredThroughTurnId: "live-1",
      generatedAt: "2026-09-08T00:00:00Z",
      model: "test",
      provider: "test",
      revision: 1,
      summary: "讨论了入职时间。",
      template: "general",
      topics: [
        {
          endMs: 2000,
          evidenceTurnIds: ["live-1"],
          id: "topic-1",
          points: [],
          startMs: 0,
          status: "completed",
          summary: "下周可入职。",
          title: "到岗安排",
        },
      ],
    },
    qualitativeResumeEvaluation: null,
    recordedAt: "2026-09-08T00:00:00Z",
    recording: {
      contentType: "audio/mp4",
      sizeBytes: 100,
      storageKey: "recording",
    },
    resume: null,
    resumeEmploymentContext: "",
    resumeText: "",
    sourceMeetingId: "meeting",
    sourceTranscriptRevisionId: "revision",
    title: "沟通记录",
    turns: [
      {
        confidence: null,
        endMs: 2000,
        id: "offline-1",
        sequence: 0,
        speakerKey: "local",
        startMs: 0,
        text: "我可以下周入职。",
        track: "local",
      },
    ],
  },
  versions: [],
};

describe("recorded initial interview content", () => {
  it("opens the corresponding transcript from a summary even when offline turn IDs differ", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      await act(() => root.render(<InitialInterviewRecordingContent detail={detail} />));
      expect(container.textContent).toContain("讨论了入职时间。");
      const topic = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "到岗安排",
      );
      expect(topic).toBeDefined();
      await act(() => topic?.click());
      expect(container.querySelector('[data-highlighted="true"]')?.textContent).toContain(
        "我可以下周入职。",
      );
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it("defaults to transcript with unavailable summary views disabled for legacy snapshots", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const legacy = { ...detail, snapshot: { ...detail.snapshot, liveSummary: undefined } };
    expect(initialInterviewSnapshotSchema.safeParse(legacy.snapshot).success).toBe(true);
    try {
      await act(() => root.render(<InitialInterviewRecordingContent detail={legacy} />));
      expect(container.textContent).toContain("我可以下周入职。");
      expect(
        container.querySelector('[aria-label="Markdown 总结"]')?.hasAttribute("disabled"),
      ).toBe(true);
      expect(container.querySelector('[aria-label="思维导图"]')?.hasAttribute("disabled")).toBe(
        true,
      );
    } finally {
      await act(() => root.unmount());
    }
  });

  it("preserves the captured summary in recruiting snapshots", () => {
    expect(initialInterviewSnapshotSchema.parse(detail.snapshot).liveSummary).toEqual(
      detail.snapshot.liveSummary,
    );
  });
});
