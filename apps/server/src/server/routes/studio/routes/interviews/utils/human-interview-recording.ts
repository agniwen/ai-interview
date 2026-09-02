import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from "livekit-server-sdk";
import {
  getHumanInterviewRecordingUploadConfig,
  isRecordingStorageConfigured,
} from "@app/object-storage";
import { HumanInterviewLiveKitConfigError } from "./human-interview-livekit";

interface HumanInterviewRecordingEgressResult {
  egressId?: string;
}

interface HumanInterviewRecordingEgressPort {
  listEgress: (options: {
    active: boolean;
    roomName: string;
  }) => Promise<HumanInterviewRecordingEgressResult[]>;
  startRoomCompositeEgress: (
    roomName: string,
    output: EncodedFileOutput,
    options: { audioOnly: true },
  ) => Promise<HumanInterviewRecordingEgressResult>;
  startParticipantEgress: (
    roomName: string,
    identity: string,
    output: { file: EncodedFileOutput },
  ) => Promise<HumanInterviewRecordingEgressResult>;
  stopEgress: (egressId: string) => Promise<HumanInterviewRecordingEgressResult>;
}

function getLiveKitEgressClient(): HumanInterviewRecordingEgressPort {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;
  if (!(apiKey && apiSecret && serverUrl)) {
    throw new HumanInterviewLiveKitConfigError();
  }
  const url = new URL(serverUrl);
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  return new EgressClient(url.toString(), apiKey, apiSecret);
}

export async function findActiveHumanInterviewRoomRecordings(
  roomName: string,
  createEgressClient: () => HumanInterviewRecordingEgressPort = getLiveKitEgressClient,
): Promise<string[]> {
  const recordings = await createEgressClient().listEgress({ active: true, roomName });
  return recordings.flatMap((recording) => (recording.egressId ? [recording.egressId] : []));
}

export function isHumanInterviewRecordingConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET &&
    process.env.LIVEKIT_URL &&
    isRecordingStorageConfigured(),
  );
}

export async function startHumanInterviewRoomRecording(
  input: {
    candidateFileKey: string;
    candidateIdentity: string;
    fileKey: string;
    roomName: string;
  },
  dependencies: {
    createEgressClient?: () => HumanInterviewRecordingEgressPort;
    loadUploadConfig?: typeof getHumanInterviewRecordingUploadConfig;
  } = {},
): Promise<{ candidateEgressId: string; egressId: string }> {
  const uploadConfig = await (
    dependencies.loadUploadConfig ?? getHumanInterviewRecordingUploadConfig
  )();
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath: input.fileKey,
    output: {
      case: "s3",
      value: new S3Upload(uploadConfig),
    },
  });
  const candidateOutput = new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath: input.candidateFileKey,
    output: {
      case: "s3",
      value: new S3Upload(uploadConfig),
    },
  });
  const client = (dependencies.createEgressClient ?? getLiveKitEgressClient)();
  const info = await client.startRoomCompositeEgress(input.roomName, output, { audioOnly: true });
  if (!info.egressId) {
    throw new Error("LiveKit 未返回真人复面录音任务 ID");
  }
  try {
    const candidateInfo = await client.startParticipantEgress(
      input.roomName,
      input.candidateIdentity,
      { file: candidateOutput },
    );
    if (!candidateInfo.egressId) {
      throw new Error("LiveKit 未返回候选人录音任务 ID");
    }
    return { candidateEgressId: candidateInfo.egressId, egressId: info.egressId };
  } catch (error) {
    await client.stopEgress(info.egressId).catch(() => null);
    throw error;
  }
}

export async function stopHumanInterviewRoomRecording(
  egressId: string,
  createEgressClient: () => HumanInterviewRecordingEgressPort = getLiveKitEgressClient,
): Promise<void> {
  await createEgressClient().stopEgress(egressId);
}
