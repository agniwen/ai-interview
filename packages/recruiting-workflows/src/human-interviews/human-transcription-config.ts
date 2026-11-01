export function humanTranscriptionMode(organizationId: string) {
  const mode = process.env.HUMAN_INTERVIEW_TRANSCRIPTION_MODE;
  const organizations = process.env.HUMAN_INTERVIEW_TRANSCRIPTION_ORGANIZATIONS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (organizations?.length && !organizations.includes(organizationId)) {
    return "legacy";
  }
  return mode === "shadow" || mode === "server_realtime" ? mode : "legacy";
}
