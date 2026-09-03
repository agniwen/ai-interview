interface InterviewCalendarJob {
  jobDescriptionName?: string | null;
}

export function interviewCalendarJobNames(candidates: InterviewCalendarJob[]): string {
  return [
    ...new Set(
      candidates.flatMap((candidate) => {
        const name = candidate.jobDescriptionName?.trim();
        return name ? [name] : [];
      }),
    ),
  ].join("、");
}

export function buildInterviewCalendarTitle(
  candidates: (InterviewCalendarJob & { candidateName: string; roundLabel: string })[],
): string {
  const names = [...new Set(candidates.map((candidate) => candidate.candidateName.trim()))].join(
    "、",
  );
  const jobNames = interviewCalendarJobNames(candidates) || "未关联岗位";
  const rounds = [...new Set(candidates.map((candidate) => candidate.roundLabel.trim()))].join(
    "、",
  );
  return `${names}-${jobNames}-${rounds}`;
}
