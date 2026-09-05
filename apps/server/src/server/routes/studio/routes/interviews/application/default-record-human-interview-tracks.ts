import { EgressStatus, TrackSource, TrackType } from "livekit-server-sdk";
import type { EgressInfo } from "livekit-server-sdk";
import type { HumanInterviewRecordingTrack } from "@app/db-schema/human-interview-recording";
import { buildHumanInterviewRecordingFileKey } from "@app/object-storage";
import {
  claimTrackRecordings,
  listTrackRecordingMeetings,
  loadTrackRecordingScope,
  updateTrackRecording,
} from "../dao/human-interview-recording-tracks";
import { listHumanInterviewLiveKitParticipants } from "../utils/human-interview-livekit";
import {
  listHumanInterviewEgress,
  startHumanInterviewTrackRecording,
  stopHumanInterviewRoomRecording,
} from "../utils/human-interview-recording";
import { recordHumanInterviewTracks } from "./record-human-interview-tracks";

function egressFileKey(info: EgressInfo): string | undefined {
  if (info.fileResults[0]?.filename) {
    return info.fileResults[0].filename;
  }
  const { request } = info;
  return request.case === "roomComposite" || request.case === "trackComposite"
    ? request.value.fileOutputs[0]?.filepath
    : undefined;
}

// oxlint-disable-next-line complexity -- one verified Egress result updates its file and timing atomically.
export async function applyHumanInterviewTrackEgress(
  roomName: string,
  info: EgressInfo,
): Promise<boolean> {
  const scope = await loadTrackRecordingScope(roomName);
  if (!scope?.meeting.recordingTracks) {
    return false;
  }
  const track = scope.meeting.recordingTracks.find(
    (item) => item.egressId === info.egressId || item.fileKey === egressFileKey(info),
  );
  if (!track) {
    return true;
  }
  const [file] = info.fileResults;
  const completed = info.status === EgressStatus.EGRESS_COMPLETE;
  const failed = [
    EgressStatus.EGRESS_FAILED,
    EgressStatus.EGRESS_ABORTED,
    EgressStatus.EGRESS_LIMIT_REACHED,
  ].includes(info.status);
  const startedAt = file?.startedAt && file.startedAt > 0n ? file.startedAt : info.startedAt;
  const endedAt = file?.endedAt && file.endedAt > 0n ? file.endedAt : info.endedAt;
  const valid = Boolean(
    file &&
    file.size > 0n &&
    file.duration > 0n &&
    file.filename === track.fileKey &&
    startedAt > 0n,
  );
  let status: HumanInterviewRecordingTrack["status"] = "active";
  let error: string | null = null;
  if (completed) {
    status = valid ? "completed" : "failed";
    if (!valid) {
      error = "录音文件或实际开始时间缺失";
    }
  } else if (failed) {
    status = "failed";
    error = info.error || "LiveKit 录音失败";
  }
  await updateTrackRecording({
    id: track.id,
    meetingId: scope.meeting.id,
    patch: {
      durationMs: file ? Number(file.duration / 1_000_000n) : 0,
      egressId: info.egressId,
      endedAtMs: endedAt > 0n ? Number(endedAt / 1_000_000n) : null,
      error,
      sizeBytes: file ? Number(file.size) : 0,
      startedAtMs: startedAt > 0n ? Number(startedAt / 1_000_000n) : null,
      status,
    },
  });
  return true;
}

export async function markHumanInterviewTrackUnpublished(input: {
  roomName: string;
  trackId?: string;
  participantIdentity?: string;
  timestampMs: number;
}): Promise<void> {
  const scope = await loadTrackRecordingScope(input.roomName);
  if (!scope) {
    return;
  }
  for (const track of scope.meeting.recordingTracks ?? []) {
    if (
      track.role !== "mixed" &&
      (track.trackId === input.trackId || track.participantIdentity === input.participantIdentity)
    ) {
      await updateTrackRecording({
        id: track.id,
        meetingId: scope.meeting.id,
        patch: { unpublishedAtMs: input.timestampMs },
      });
    }
  }
}

export async function synchronizeHumanInterviewTrackRecordings(
  roomName: string,
  published?: { trackId: string; timestampMs: number },
): Promise<void> {
  const scope = await loadTrackRecordingScope(roomName);
  if (!scope || !["scheduled", "in_progress"].includes(scope.meeting.status)) {
    return;
  }
  const participants = await listHumanInterviewLiveKitParticipants(roomName);
  const authorized = participants.flatMap((participant) => {
    const person = scope.participants.find((item) => item.identity === participant.identity);
    return person ? [{ participant, person }] : [];
  });
  if (
    !scope.meeting.recordingTracks &&
    (!authorized.some((item) => item.person.role === "candidate") ||
      !authorized.some((item) => item.person.role === "interviewer"))
  ) {
    return;
  }
  const base = await buildHumanInterviewRecordingFileKey({
    meetingId: scope.meeting.id,
    organizationId: scope.meeting.organizationId,
  });
  const now = Date.now();
  const sources = [
    { displayName: null, participantIdentity: null, role: "mixed" as const, trackId: "mixed" },
    ...authorized.flatMap(({ person, participant }) =>
      participant.tracks
        .filter(
          (track) => track.source === TrackSource.MICROPHONE && track.type === TrackType.AUDIO,
        )
        .map((track) => ({
          displayName: person.name,
          participantIdentity: person.identity,
          role: person.role,
          trackId: track.sid,
        })),
    ),
  ];
  const proposed: HumanInterviewRecordingTrack[] = sources.map((source) => {
    const id = crypto.randomUUID();
    return {
      ...source,
      durationMs: 0,
      egressId: null,
      endedAtMs: null,
      error: null,
      fileKey: base.replace(/room-audio\.ogg$/, `tracks/${id}.ogg`),
      id,
      publishedAtMs: published?.trackId === source.trackId ? published.timestampMs : now,
      sizeBytes: 0,
      startedAtMs: null,
      status: "starting",
      updatedAtMs: now,
    };
  });
  const tracks = await claimTrackRecordings({
    meetingId: scope.meeting.id,
    organizationId: scope.meeting.organizationId,
    proposed,
  });
  await recordHumanInterviewTracks(
    { roomName, tracks },
    {
      saveStartError: async ({ id, error }) => {
        await updateTrackRecording({ id, meetingId: scope.meeting.id, patch: { error } });
      },
      saveStarted: ({ id, egressId }) =>
        updateTrackRecording({
          id,
          meetingId: scope.meeting.id,
          patch: { egressId, status: "active" },
        }),
      start: startHumanInterviewTrackRecording,
      stop: stopHumanInterviewRoomRecording,
    },
  );
}

// oxlint-disable-next-line complexity -- reconciliation owns bounded timeouts and late completion for each recording.
export async function reconcileHumanInterviewTrackRecordings(): Promise<void> {
  for (const { roomName } of await listTrackRecordingMeetings()) {
    if (!roomName) {
      continue;
    }
    try {
      const scope = await loadTrackRecordingScope(roomName);
      if (!scope) {
        continue;
      }
      const egresses = await listHumanInterviewEgress(roomName).catch(() => []);
      for (const info of egresses) {
        await applyHumanInterviewTrackEgress(roomName, info);
      }
      const refreshed = await loadTrackRecordingScope(roomName);
      for (const track of refreshed?.meeting.recordingTracks ?? []) {
        const ended = scope.meeting.status === "ended";
        const timeout = ended
          ? Date.now() - (scope.meeting.endedAt?.getTime() ?? Date.now()) > 5 * 60_000
          : track.status === "starting" && Date.now() - track.updatedAtMs > 2 * 60_000;
        if (timeout && ["starting", "active"].includes(track.status)) {
          if (track.egressId) {
            await stopHumanInterviewRoomRecording(track.egressId).catch(() => null);
          }
          await updateTrackRecording({
            id: track.id,
            meetingId: scope.meeting.id,
            patch: { error: "录音完成超时，使用其他音轨或全场录音补救", status: "failed" },
          });
        } else if (ended && track.status === "active" && track.egressId) {
          await stopHumanInterviewRoomRecording(track.egressId).catch(() => null);
        }
      }
      if (scope.meeting.status !== "ended") {
        await synchronizeHumanInterviewTrackRecordings(roomName);
      }
    } catch (error) {
      console.warn("human interview recording reconciliation interrupted", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
