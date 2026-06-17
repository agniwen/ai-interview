export const INTERVIEW_RECORDING_ENABLED_ENV_NAME = "NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING";

type InterviewRecordingEnv = Partial<
  Record<typeof INTERVIEW_RECORDING_ENABLED_ENV_NAME, string | boolean | number | undefined>
>;

export function resolveInterviewRecordingEnabled(env: InterviewRecordingEnv): boolean {
  const raw = env[INTERVIEW_RECORDING_ENABLED_ENV_NAME];
  if (raw === undefined || raw === "") {
    return true;
  }
  return String(raw).trim().toLowerCase() !== "false";
}
