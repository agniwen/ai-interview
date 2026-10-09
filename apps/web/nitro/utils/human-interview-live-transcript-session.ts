export async function renewHumanInterviewLiveTranscriptLease(input: {
  close: (reason: "transcript-heartbeat-failed" | "transcript-lease-expired") => void;
  heartbeat: () => Promise<boolean>;
}): Promise<void> {
  try {
    if (!(await input.heartbeat())) {
      input.close("transcript-lease-expired");
    }
  } catch {
    input.close("transcript-heartbeat-failed");
  }
}
