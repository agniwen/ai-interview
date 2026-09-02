// Called by smoke.py --application; exercises the real application recording adapter.
import {
  buildHumanInterviewRecordingFileKey,
  buildHumanInterviewCandidateRecordingFileKey,
  headMeetingRecordingObject,
} from "../../packages/object-storage/src/index";
import { startHumanInterviewRoomRecording } from "../../apps/server/src/server/routes/studio/routes/interviews/utils/human-interview-recording";

const [action, roomName] = process.argv.slice(2);
if (!roomName || !/^local-smoke-[a-f0-9]{12}$/.test(roomName)) {
  throw new Error("Only synthetic smoke rooms are allowed");
}
const url = new URL(process.env.LIVEKIT_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "7880") {
  throw new Error("Application smoke test requires local LiveKit on port 7880");
}
const scope = { meetingId: roomName, organizationId: "local-smoke" };
const fileKey = await buildHumanInterviewRecordingFileKey(scope);
const candidateFileKey = await buildHumanInterviewCandidateRecordingFileKey(scope);
if (action === "start") {
  const result = await startHumanInterviewRoomRecording({
    candidateFileKey,
    candidateIdentity: "synthetic-candidate",
    fileKey,
    roomName,
  });
  console.log(JSON.stringify(result));
} else if (action === "verify") {
  const objects = await Promise.all(
    [fileKey, candidateFileKey].map(async (key) => {
      const object = await headMeetingRecordingObject(key);
      if (!object || object.contentLength <= 0) {
        throw new Error("Recording object missing or empty");
      }
      return { bytes: object.contentLength, key };
    }),
  );
  console.log(JSON.stringify({ objects, storage: "verified" }));
} else {
  throw new Error("Expected start or verify");
}
