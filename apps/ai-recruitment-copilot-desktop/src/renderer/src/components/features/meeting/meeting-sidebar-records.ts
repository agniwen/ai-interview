import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import type { LocalMeetingSessionState } from "../../../../../preload/local-meeting-session";

export interface LocalMeetingSidebarRecord {
  captureId: string;
  state: "active" | LocalMeetingSessionState;
  title: string;
}

export function collectRemotelyVisibleVerifiedIds(
  snapshot: MeetingCaptureSnapshot,
  remoteMeetingIds: ReadonlySet<string>,
): string[] {
  return snapshot.localSessions
    .filter((session) => session.state === "workspace-verified" && remoteMeetingIds.has(session.id))
    .map((session) => session.id)
    .toSorted();
}

export function collectLocalMeetingSidebarRecords(
  snapshot: MeetingCaptureSnapshot,
): LocalMeetingSidebarRecord[] {
  const records: LocalMeetingSidebarRecord[] = [];
  const seen = new Set<string>();
  if (snapshot.active) {
    const session = snapshot.localSessions.find((item) => item.id === snapshot.active?.captureId);
    seen.add(snapshot.active.captureId);
    records.push({
      captureId: snapshot.active.captureId,
      state: "active",
      title: session?.title ?? "录制中…",
    });
  }
  for (const session of snapshot.localSessions) {
    if (seen.has(session.id)) {
      continue;
    }
    seen.add(session.id);
    records.push({ captureId: session.id, state: session.state, title: session.title });
  }
  if (snapshot.saved && !seen.has(snapshot.saved.captureId)) {
    seen.add(snapshot.saved.captureId);
    records.push({
      captureId: snapshot.saved.captureId,
      state: "saved-local",
      title: "本地录音",
    });
  }
  for (const capture of snapshot.recoverable) {
    if (seen.has(capture.captureId)) {
      continue;
    }
    seen.add(capture.captureId);
    records.push({
      captureId: capture.captureId,
      state: capture.status,
      title: capture.status === "interrupted" ? "中断录音" : "本地录音",
    });
  }
  return records;
}
