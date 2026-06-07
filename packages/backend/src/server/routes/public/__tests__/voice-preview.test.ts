import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/backend/server/factory";
import { publicRouter } from "../route";

const mocks = vi.hoisted(() => ({
  dbRows: [] as { contentType: string; storageKey: string }[],
  getObjectStream: vi.fn(),
}));

vi.mock("@arc/backend/lib/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.dbRows)),
        })),
      })),
    })),
  },
}));

vi.mock("@arc/backend/lib/server/s3", () => ({
  getObjectStream: mocks.getObjectStream,
  presignRecordingGetObjectUrl: vi.fn(),
}));

const app = factory.createApp().route("/public", publicRouter);

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("GET /public/minimax-voice-previews/:id", () => {
  beforeEach(() => {
    mocks.dbRows = [];
    mocks.getObjectStream.mockReset();
  });

  it("streams cached preview audio from object storage", async () => {
    mocks.dbRows = [{ contentType: "audio/mpeg", storageKey: "voice-previews/example.mp3" }];
    mocks.getObjectStream.mockResolvedValue({
      body: streamFromBytes(new Uint8Array([1, 2, 3])),
      contentLength: 3,
      contentType: "audio/mpeg",
    });

    const res = await app.request("/public/minimax-voice-previews/preview-id");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.getObjectStream).toHaveBeenCalledWith("voice-previews/example.mp3");
  });

  it("returns 404 when the preview cache row does not exist", async () => {
    const res = await app.request("/public/minimax-voice-previews/missing-id");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "试听音频不存在。" });
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
  });
});
