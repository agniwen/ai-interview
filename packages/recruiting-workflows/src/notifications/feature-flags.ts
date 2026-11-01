function enabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isInterviewNotificationFlowEnabled(): boolean {
  return enabled(process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED);
}

export function isInterviewNotificationWorkerEnabled(): boolean {
  return (
    isInterviewNotificationFlowEnabled() &&
    enabled(process.env.INTERVIEW_NOTIFICATION_WORKER_ENABLED)
  );
}
