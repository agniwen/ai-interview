// @vitest-environment jsdom

import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResumeReviewRegeneration } from "./use-resume-review-regeneration";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  generateResumeReview: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/client/resume-analysis", () => ({
  generateResumeReview: mocks.generateResumeReview,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const resumeProfile: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: "未发现信息",
  name: "郭靖",
  personalStrengths: ["沟通清晰"],
  phone: "13800138000",
  projectExperiences: [],
  schools: ["江南大学"],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

type HookValue = ReturnType<typeof useResumeReviewRegeneration>;

function renderHookHarness(callbacks: {
  onDraftChange: (review: string) => void;
  onGenerated: (review: string) => void;
}) {
  let current: HookValue | null = null;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness() {
    current = useResumeReviewRegeneration(callbacks);
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  if (!current) {
    throw new Error("Hook did not render");
  }

  return {
    get current() {
      if (!current) {
        throw new Error("Hook is not mounted");
      }
      return current;
    },
    root,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useResumeReviewRegeneration", () => {
  it("streams draft updates and commits the generated review", async () => {
    const onDraftChange = vi.fn();
    const onGenerated = vi.fn();
    mocks.generateResumeReview.mockImplementationOnce(({ onDraftChange: onDraft }) => {
      onDraft("草稿评价");
      return "最终评价";
    });

    const harness = renderHookHarness({ onDraftChange, onGenerated });

    await act(async () => {
      await harness.current.regenerate({
        jobDescriptionId: "jd_1",
        resumeProfile,
      });
    });

    expect(mocks.generateResumeReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescriptionId: "jd_1",
        resumeProfile,
      }),
    );
    expect(onDraftChange).toHaveBeenCalledWith("草稿评价");
    expect(onGenerated).toHaveBeenCalledWith("最终评价");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已重新生成简历评价");

    act(() => {
      harness.root.unmount();
    });
  });

  it("aborts in-flight generation when cancelled", async () => {
    const onDraftChange = vi.fn();
    const onGenerated = vi.fn();
    const captured: { signal: AbortSignal | null } = { signal: null };
    const abortDeferred = Promise.withResolvers<null>();
    mocks.generateResumeReview.mockImplementationOnce(({ signal }) => {
      captured.signal = signal ?? null;
      signal?.addEventListener("abort", () => abortDeferred.resolve(null), { once: true });
      return abortDeferred.promise;
    });

    const harness = renderHookHarness({ onDraftChange, onGenerated });
    let generation: Promise<void>;

    act(() => {
      generation = harness.current.regenerate({
        jobDescriptionId: "jd_1",
        resumeProfile,
      });
    });

    await act(async () => {
      harness.current.cancel();
      await generation;
    });

    if (!captured.signal) {
      throw new Error("Expected generation signal to be captured");
    }
    expect(captured.signal.aborted).toBe(true);
    expect(onGenerated).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    act(() => {
      harness.root.unmount();
    });
  });
});
