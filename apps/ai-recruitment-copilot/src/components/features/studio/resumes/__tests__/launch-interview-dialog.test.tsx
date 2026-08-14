// @vitest-environment jsdom

import { act } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { LaunchInterviewDialog } from "../launch-interview-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchStudioResume: vi.fn(),
  launchInterviewFromResume: vi.fn(),
}));

vi.mock("@/lib/client/api", () => ({
  fetchStudioResume: mocks.fetchStudioResume,
  launchInterviewFromResume: mocks.launchInterviewFromResume,
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "workspace",
}));

vi.mock("@/lib/client/rpc", () => ({ rpc: { api: {} } }));

vi.mock("@/env/client", () => ({
  env: { NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: false },
}));

vi.mock("@/components/features/motion/animated-height", () => ({
  AnimatedHeight: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/features/resume/resume-profile-view", () => ({
  ResumeProfileView: () => null,
}));

vi.mock("@/components/features/studio/sortable-question-list-editor", () => ({
  SortableQuestionListEditor: () => null,
}));

vi.mock("../resume-overview-panel", () => ({
  ResumeOverviewPanel: () => null,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    children,
    footer,
    open,
    title,
  }: {
    children: ReactNode;
    footer: ReactNode;
    open: boolean;
    title: string;
  }) =>
    open ? (
      <dialog aria-label={title} open>
        {children}
        {footer}
      </dialog>
    ) : null,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogAction: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`button not found: ${label}`);
  }
  return button;
}

const failedEvaluationDetail = {
  resumeEvaluationArtifactMode: "structured",
  structuredGateStatus: "failed",
  structuredResumeEvaluation: { runId: "run-1" },
  structuredScoreGrade: "unmatched",
} as ResumeLibraryDetail;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("LaunchInterviewDialog", () => {
  it("shows progress on the final confirmation while launching a below-threshold candidate", async () => {
    const { promise: launchPromise, resolve: resolveLaunch } = Promise.withResolvers<{
      id: string;
    }>();
    mocks.fetchStudioResume.mockResolvedValue(failedEvaluationDetail);
    mocks.launchInterviewFromResume.mockReturnValue(launchPromise);
    const onLaunched = vi.fn();
    const onOpenChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <LaunchInterviewDialog
          candidateName="候选人"
          onLaunched={onLaunched}
          onOpenChange={onOpenChange}
          open
          recordId="resume-1"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      getButton("发起").click();
      await Promise.resolve();
    });
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      "仍要发起 AI 面试？",
    );

    await act(async () => {
      getButton("确认发起").click();
      await Promise.resolve();
    });

    expect(mocks.launchInterviewFromResume).toHaveBeenCalledOnce();
    expect(mocks.launchInterviewFromResume).toHaveBeenCalledWith("workspace", "resume-1", [], {
      gateStatus: "failed",
      grade: "unmatched",
      runId: "run-1",
    });
    expect(getButton("正在发起").disabled).toBe(true);

    await act(async () => {
      resolveLaunch({ id: "round-1" });
      await launchPromise;
    });

    expect(onLaunched).toHaveBeenCalledWith({ id: "round-1" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    act(() => root.unmount());
  });
});
