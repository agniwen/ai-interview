import type { CandidateInterviewView } from "@app/shared/interview/interview-record";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InterviewRoleContext } from "../interview-entry-view";
import { InterviewPreSessionFlow } from "../interview-pre-session-flow";
import type { FormsPayload } from "../pre-interview-forms/types";

const interviewView = {
  aiReview: {
    baseScore: 86,
    conclusion: "legacy-ai-review",
    dimensions: [],
    strengths: [],
  },
  candidateName: "Candidate",
  companyContext: "company-context",
  currentRoundAllowTextInput: true,
  currentRoundCanResume: false,
  currentRoundFeedback: null,
  currentRoundId: "round-id",
  currentRoundLabel: "Round",
  currentRoundRecoverableUntil: null,
  currentRoundStatus: "pending",
  currentRoundTime: null,
  id: "interview-id",
  interviewQuestions: [],
  jobDescriptionDescription: "legacy-job-description",
  jobDescriptionName: "Role",
  jobDescriptionPrompt: "canonical-job-description",
  resumeProfile: null,
  targetRole: "Role",
} satisfies CandidateInterviewView;

const pendingForms: FormsPayload = {
  required: [
    {
      snapshot: {
        description: null,
        jobDescriptionIds: [],
        questions: [],
        scope: "global",
        templateId: "template-1",
        title: "Form",
      },
      templateId: "template-1",
      version: 1,
      versionId: "version-1",
    },
  ],
  submitted: {},
};

const submittedForms: FormsPayload = { ...pendingForms, submitted: { "template-1": true } };

function renderFlow(
  overrides: Partial<{
    formsBound: boolean;
    formsPayload: FormsPayload;
    isRoundCompleted: boolean;
  }> = {},
) {
  return renderToStaticMarkup(
    <InterviewPreSessionFlow
      entryLoadError={null}
      formsBound={overrides.formsBound ?? false}
      formsPayload={overrides.formsPayload ?? { required: [], submitted: {} }}
      interviewId="interview-id"
      interviewView={interviewView}
      isLoading={false}
      isRecovering={false}
      isRoundCompleted={overrides.isRoundCompleted ?? false}
      onFormsBack={vi.fn()}
      onRetry={vi.fn()}
      renderEntry={(stage, _view, hasForms) => (
        <div data-entry-stage={stage} data-has-forms={String(hasForms)} />
      )}
      roundId="round-id"
      waitingView={<div data-waiting-view />}
    />,
  );
}

describe("InterviewPreSessionFlow", () => {
  it("goes straight to the device check when no forms are required", () => {
    expect(renderFlow()).toContain('data-entry-stage="ready"');
  });

  it("welcomes the candidate before binding pending forms", () => {
    expect(renderFlow({ formsPayload: pendingForms })).toContain('data-entry-stage="welcome"');
  });

  it("asks for pending forms once they are bound", () => {
    const markup = renderFlow({ formsBound: true, formsPayload: pendingForms });

    expect(markup).not.toContain("data-entry-stage");
  });

  it("skips forms that were already submitted while keeping the form step visible", () => {
    const markup = renderFlow({ formsPayload: submittedForms });

    expect(markup).toContain('data-entry-stage="ready"');
    expect(markup).toContain('data-has-forms="true"');
  });

  it("shows the terminal view for a completed round", () => {
    expect(renderFlow({ formsPayload: pendingForms, isRoundCompleted: true })).toContain(
      "data-waiting-view",
    );
  });
});

describe("InterviewRoleContext", () => {
  it("uses the canonical JD without exposing retired evaluation inputs", () => {
    const markup = renderToStaticMarkup(<InterviewRoleContext interviewView={interviewView} />);

    expect(markup).toContain(interviewView.jobDescriptionPrompt);
    expect(markup).toContain(interviewView.companyContext);
    expect(markup).not.toContain(interviewView.jobDescriptionDescription);
    expect(markup).not.toContain(interviewView.aiReview.conclusion);
  });
});
