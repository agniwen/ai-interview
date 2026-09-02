// @vitest-environment jsdom
// oxlint-disable promise/avoid-new -- The relay handshake is driven by WebSocket events.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveCorrectionBatch } from "@app/shared/meeting-live-correction";
import { z } from "zod";
import { connectHumanInterviewTranscriptRelay } from "./web-relay-transport";

class RelayWebSocket extends EventTarget {
  static readonly OPEN = 1;
  static latest: RelayWebSocket | null = null;
  closed = false;
  readonly protocols: string[];
  readonly sent: (ArrayBuffer | string)[] = [];
  readonly readyState = RelayWebSocket.OPEN;
  readonly url: string;

  constructor(url: string, protocols: string[]) {
    super();
    this.protocols = protocols;
    this.url = url;
    RelayWebSocket.latest = this;
  }

  close(): void {
    this.closed = true;
  }

  send(message: ArrayBuffer | string): void {
    this.sent.push(message);
  }
}

const batch: LiveCorrectionBatch = {
  batchId: "00000000-0000-4000-8000-000000000001",
  blocks: [
    {
      id: "capture:microphone:0:item-1",
      itemId: "item-1",
      originalText: "候选人介绍项目经验",
      sectionId: "capture:microphone:0",
      track: "microphone",
    },
  ],
  context: { after: [], before: [] },
};

afterEach(() => {
  RelayWebSocket.latest = null;
  vi.unstubAllGlobals();
});

describe("human interview transcript relay transport", () => {
  it("sends correction batches over the same authenticated relay", async () => {
    vi.stubGlobal("WebSocket", RelayWebSocket);
    const connecting = connectHumanInterviewTranscriptRelay({
      authorization: {
        captureId: "00000000-0000-4000-8000-000000000002",
        inviteToken: "invite-token",
        track: "microphone",
      },
      captureId: "00000000-0000-4000-8000-000000000002",
      onCorrection: vi.fn(),
      onDisconnect: vi.fn(),
      onTranscript: vi.fn(),
      onWritable: vi.fn(),
      sectionId: batch.blocks[0].sectionId,
    });
    const socket = RelayWebSocket.latest;
    expect(socket?.protocols).toContainEqual(expect.stringMatching(/^arc-section\./u));
    socket?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ event: { type: "session.created" }, type: "event" }),
      }),
    );

    const connection = await connecting;

    expect(connection.correct?.(batch)).toBe(true);
    expect(
      socket?.sent.map((message) => {
        const text = z.string().safeParse(message);
        return text.success ? JSON.parse(text.data) : null;
      }),
    ).toContainEqual({ batch, type: "correct" });
    connection.close();
  });
});
