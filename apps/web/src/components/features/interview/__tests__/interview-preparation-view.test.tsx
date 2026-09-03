import type { CandidateInterviewView } from "@app/shared/interview/interview-record";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InterviewPreparationView } from "../interview-preparation-view";

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

describe("InterviewPreparationView", () => {
  it("uses the canonical JD without exposing retired evaluation inputs", () => {
    const markup = renderToStaticMarkup(
      <InterviewPreparationView hasForms interviewView={interviewView} onContinue={vi.fn()} />,
    );

    expect(markup).toContain(interviewView.jobDescriptionPrompt);
    expect(markup).not.toContain(interviewView.jobDescriptionDescription);
    expect(markup).not.toContain(interviewView.aiReview.conclusion);
  });
});
