import { describe, expect, it } from "vitest";

import { runMeetingTranscriptionProcessing } from "../processor";

import { createDependencies, job } from "../processor-test-fixtures";

describe("Meeting final transcription review threshold", () => {
  it.each([
    { reviewed: false, unknownSpeechMs: 1500 },
    { reviewed: true, unknownSpeechMs: 40_000 },
  ])(
    "requires review for recovered unattributed speech only beyond a brief reconnect ($unknownSpeechMs ms)",
    async ({ reviewed, unknownSpeechMs }) => {
      const deps = createDependencies();
      const assets = (["candidate", "interviewer", "unknown"] as const).map((role, index) => ({
        contentType: "audio/ogg",
        durationMs: 60_000,
        recordingIdentity: {
          offsetMs: 0,
          participantIdentity: role === "unknown" ? null : `${index}`,
          recoveryRanges: role === "unknown" ? [{ endMs: 50_000, startMs: 5000 }] : [],
          role,
          sourceId: `${index}`,
        },
        sizeBytes: 100,
        status: "ready",
        storageKey: `${index}.ogg`,
        track: role === "unknown" ? "mixed" : `participant-${index}`,
      }));
      await runMeetingTranscriptionProcessing(
        job,
        { attempt: 1, maxAttempts: 3 },
        {
          ...deps,
          cropRecoveryChunks: (chunk) => Promise.resolve([chunk]),
          loadSource: () =>
            Promise.resolve({
              assets,
              id: job.meetingId,
              manifestSha256: job.sourceManifestSha256,
              organizationId: job.organizationId,
            }),
          prepareChunks: ({ sources }) =>
            Promise.resolve(
              sources.map((source) => ({
                ...source,
                contentType: "audio/webm",
                endMs: 60_000,
                index: 0,
                startMs: 0,
              })),
            ),
          provider: {
            transcribeFinal: ({ chunks }) =>
              Promise.resolve({
                language: "zh",
                turns:
                  chunks[0]?.track === "mixed"
                    ? [
                        {
                          confidence: null,
                          endMs: 6000 + unknownSpeechMs,
                          speakerKey: "remote-1",
                          startMs: 6000,
                          text: "重连期间的发言",
                          track: "remote" as const,
                        },
                      ]
                    : [],
              }),
          },
        },
      );
      expect(deps.publish.mock.calls[0]?.[0].transcript.turns[0]?.attribution?.role).toBe(
        "unknown",
      );
      expect(deps.publish.mock.calls[0]?.[0].warning).toEqual(
        reviewed ? expect.stringContaining("部分录音") : undefined,
      );
    },
  );
});
