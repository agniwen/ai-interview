import { describe, expect, it } from "vitest";
import { recordHumanInterviewTracks } from "../record-human-interview-tracks";

describe("recordHumanInterviewTracks", () => {
  it("keeps whole-room and interviewer recordings when candidate recording fails", async () => {
    const saved: string[] = [];
    const failures: string[] = [];
    await recordHumanInterviewTracks(
      {
        roomName: "human_test",
        tracks: [
          { fileKey: "room.ogg", id: "room", trackId: "mixed" },
          { fileKey: "candidate.ogg", id: "candidate", trackId: "mic-candidate" },
          { fileKey: "host.ogg", id: "host", trackId: "mic-host" },
        ],
      },
      {
        saveStartError: ({ id }) => {
          failures.push(id);
          return Promise.resolve();
        },
        saveStarted: ({ id }) => {
          saved.push(id);
          return Promise.resolve(true);
        },
        start: ({ trackId }) => {
          if (trackId === "mic-candidate") {
            return Promise.reject(new Error("unavailable"));
          }
          return Promise.resolve(`egress-${trackId}`);
        },
        stop: () => Promise.reject(new Error("Healthy recordings must not stop")),
      },
    );
    expect(saved).toEqual(["room", "host"]);
    expect(failures).toEqual(["candidate"]);
  });
});
