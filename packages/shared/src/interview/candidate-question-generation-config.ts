export const CANDIDATE_QUESTION_GENERATION_ENABLED_ENV_NAME =
  "NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS";

type CandidateQuestionGenerationEnv = Partial<
  Record<
    typeof CANDIDATE_QUESTION_GENERATION_ENABLED_ENV_NAME,
    string | boolean | number | undefined
  >
>;

export function resolveCandidateQuestionGenerationEnabled(
  env: CandidateQuestionGenerationEnv,
): boolean {
  const raw = env[CANDIDATE_QUESTION_GENERATION_ENABLED_ENV_NAME];
  if (raw === undefined || raw === "") {
    return true;
  }
  return String(raw).trim().toLowerCase() !== "false";
}
