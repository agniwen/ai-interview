import { setTimeout as delay } from "node:timers/promises";
import {
  buildHumanInterviewCandidateRecordingFileKey,
  buildHumanInterviewRecordingFileKey,
} from "@app/object-storage";
import {
  claimHumanInterviewRecordingStartByRoomName,
  loadActiveHumanInterviewRecordingByRoomName,
  loadActiveHumanInterviewRecordingEgressId,
  markHumanInterviewRecordingFailed,
  markHumanInterviewRecordingStarted,
} from "../dao/human-interview-meetings";
import {
  findActiveHumanInterviewRoomRecordings,
  startHumanInterviewRoomRecording,
  stopHumanInterviewRoomRecording,
} from "./human-interview-recording";

interface HumanInterviewRecordingServiceDependencies {
  buildFileKey: typeof buildHumanInterviewRecordingFileKey;
  buildCandidateFileKey: typeof buildHumanInterviewCandidateRecordingFileKey;
  claimStart: typeof claimHumanInterviewRecordingStartByRoomName;
  findActiveRecordings: typeof findActiveHumanInterviewRoomRecordings;
  markFailed: typeof markHumanInterviewRecordingFailed;
  markStarted: typeof markHumanInterviewRecordingStarted;
  sleep: (durationMs: number) => Promise<void>;
  startRecording: typeof startHumanInterviewRoomRecording;
  stopRecording: typeof stopHumanInterviewRoomRecording;
}

const defaultDependencies: HumanInterviewRecordingServiceDependencies = {
  buildCandidateFileKey: buildHumanInterviewCandidateRecordingFileKey,
  buildFileKey: buildHumanInterviewRecordingFileKey,
  claimStart: claimHumanInterviewRecordingStartByRoomName,
  findActiveRecordings: findActiveHumanInterviewRoomRecordings,
  markFailed: markHumanInterviewRecordingFailed,
  markStarted: markHumanInterviewRecordingStarted,
  sleep: (durationMs) => delay(durationMs),
  startRecording: startHumanInterviewRoomRecording,
  stopRecording: stopHumanInterviewRoomRecording,
};

export async function startEligibleHumanInterviewRecording(
  roomName: string,
  overrides: Partial<HumanInterviewRecordingServiceDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const claim = await dependencies.claimStart(roomName);
  if (!claim) {
    return;
  }
  let egressId: string | undefined;
  let candidateEgressId: string | undefined;
  let fileKey: string | undefined;
  let candidateFileKey: string | undefined;
  try {
    [fileKey, candidateFileKey] = await Promise.all([
      dependencies.buildFileKey({
        meetingId: claim.meetingId,
        organizationId: claim.organizationId,
      }),
      dependencies.buildCandidateFileKey({
        meetingId: claim.meetingId,
        organizationId: claim.organizationId,
      }),
    ]);
    const activeEgressIds = await dependencies.findActiveRecordings(claim.roomName);
    await Promise.all(
      activeEgressIds.map((activeEgressId) => dependencies.stopRecording(activeEgressId)),
    );
    ({ candidateEgressId, egressId } = await dependencies.startRecording({
      candidateFileKey,
      candidateIdentity: claim.candidateIdentity,
      fileKey,
      roomName: claim.roomName,
    }));
    const shouldContinue = await dependencies.markStarted({
      candidateEgressId,
      candidateFileKey,
      egressId,
      fileKey,
      meetingId: claim.meetingId,
    });
    if (!shouldContinue) {
      await Promise.all([
        dependencies.stopRecording(egressId),
        dependencies.stopRecording(candidateEgressId),
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "真人复面录音启动失败";
    await dependencies.markFailed({
      candidateEgressId,
      candidateFileKey,
      egressId,
      error: message,
      fileKey,
      meetingId: claim.meetingId,
    });
    throw error;
  }
}

const HUMAN_INTERVIEW_RECORDING_RETRY_DELAYS_MS = [1000, 3000] as const;

export async function startEligibleHumanInterviewRecordingWithRetry(
  roomName: string,
  overrides: Partial<HumanInterviewRecordingServiceDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  for (let attempt = 0; ; attempt += 1) {
    try {
      await startEligibleHumanInterviewRecording(roomName, dependencies);
      return;
    } catch (error) {
      const retryDelay = HUMAN_INTERVIEW_RECORDING_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined) {
        throw error;
      }
      await dependencies.sleep(retryDelay);
    }
  }
}

export async function stopActiveHumanInterviewRecording(meetingId: string): Promise<void> {
  const egressIds = await loadActiveHumanInterviewRecordingEgressId(meetingId);
  await Promise.all(egressIds.map((egressId) => stopHumanInterviewRoomRecording(egressId)));
}

export async function stopActiveHumanInterviewRecordingByRoomName(roomName: string): Promise<void> {
  const recording = await loadActiveHumanInterviewRecordingByRoomName(roomName);
  if (!recording) {
    return;
  }
  await Promise.all(
    recording.egressIds.map((egressId) => stopHumanInterviewRoomRecording(egressId)),
  );
}
