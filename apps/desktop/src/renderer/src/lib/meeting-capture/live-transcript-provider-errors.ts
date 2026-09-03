import { isApiError } from "@/lib/client/api-error";

export class LocalMeetingLiveTranscriptAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalMeetingLiveTranscriptAuthorizationError";
  }
}

export function shouldReconnectMeetingLiveTranscript(error: Error): boolean {
  if (error instanceof LocalMeetingLiveTranscriptAuthorizationError) {
    return false;
  }
  return !isApiError(error) || ![400, 401, 403, 404, 409, 422, 429, 503].includes(error.status);
}
