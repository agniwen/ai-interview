import { loadExpiredEstablishedHumanInterviewMeetings } from "../dao/human-interview-meeting-lifecycle";
import { endHumanInterviewMeetingByRoomName } from "../dao/human-interview-meetings";
import { listHumanInterviewLiveKitRooms } from "../utils/human-interview-livekit";

export async function reconcileExpiredHumanInterviewMeetings(): Promise<void> {
  const meetings = await loadExpiredEstablishedHumanInterviewMeetings(new Date());
  const names = meetings.flatMap((meeting) =>
    meeting.liveKitRoomName ? [meeting.liveKitRoomName] : [],
  );
  if (names.length === 0) {
    return;
  }
  // The admission deadline must not disconnect an ongoing interview. An API
  // failure is not evidence of room closure; let the next recovery pass retry.
  const rooms = await listHumanInterviewLiveKitRooms(names);
  const activeNames = new Set(rooms.map((room) => room.name));
  for (const name of names) {
    if (!activeNames.has(name)) {
      // Re-resolve the room and recheck status/expiry under the lifecycle lock,
      // so cancellation or rescheduling during the LiveKit request wins.
      await endHumanInterviewMeetingByRoomName(name);
    }
  }
}
