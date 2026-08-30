import { describe, expect, it, vi } from "vitest";
import {
  getOrCreateMinimaxVoicePreview,
  MINIMAX_VOICE_PREVIEW_FORMAT,
  MINIMAX_VOICE_PREVIEW_MODEL,
  MINIMAX_VOICE_PREVIEW_TEXT,
} from "@app/server/server/routes/studio/routes/interviewers/voice-preview";

const IDENTITY = {
  format: MINIMAX_VOICE_PREVIEW_FORMAT,
  model: MINIMAX_VOICE_PREVIEW_MODEL,
  previewText: MINIMAX_VOICE_PREVIEW_TEXT,
  previewTextHash: "preview-hash",
  voice: "male-qn-qingse" as const,
};

function makeDeps(overrides: Partial<Parameters<typeof getOrCreateMinimaxVoicePreview>[1]> = {}) {
  return {
    buildPublicUrl: vi.fn((id: string) => `/api/public/minimax-voice-previews/${id}`),
    buildStorageKey: vi.fn(() => "voice-previews/minimax/preview-hash/male-qn-qingse.mp3"),
    generateId: vi.fn(() => "preview-id"),
    hashText: vi.fn(() => "preview-hash"),
    insertPreview: vi.fn((record) => Promise.resolve(record)),
    loadPreview: vi.fn(() => Promise.resolve(null)),
    putObjectBytes: vi.fn(() => Promise.resolve()),
    synthesizeAudio: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
    ...overrides,
  };
}

describe("getOrCreateMinimaxVoicePreview", () => {
  it("returns cached URL without generating audio", async () => {
    const deps = makeDeps({
      loadPreview: vi.fn(() =>
        Promise.resolve({
          ...IDENTITY,
          contentType: "audio/mpeg",
          createdAt: "2026-06-03T00:00:00.000Z",
          id: "cached-id",
          publicUrl: "https://cdn.example.com/cached.mp3",
          sizeBytes: 123,
          storageKey: "cached.mp3",
          updatedAt: "2026-06-03T00:00:00.000Z",
        }),
      ),
    });

    const result = await getOrCreateMinimaxVoicePreview({ voice: "male-qn-qingse" }, deps);

    expect(result).toEqual({
      cached: true,
      previewText: MINIMAX_VOICE_PREVIEW_TEXT,
      url: "https://cdn.example.com/cached.mp3",
      voice: "male-qn-qingse",
    });
    expect(deps.synthesizeAudio).not.toHaveBeenCalled();
    expect(deps.putObjectBytes).not.toHaveBeenCalled();
    expect(deps.insertPreview).not.toHaveBeenCalled();
  });

  it("generates, uploads, and stores preview audio on cache miss", async () => {
    const deps = makeDeps();

    const result = await getOrCreateMinimaxVoicePreview({ voice: "male-qn-qingse" }, deps);

    expect(deps.synthesizeAudio).toHaveBeenCalledWith({
      model: MINIMAX_VOICE_PREVIEW_MODEL,
      text: MINIMAX_VOICE_PREVIEW_TEXT,
      voice: "male-qn-qingse",
    });
    expect(deps.putObjectBytes).toHaveBeenCalledWith({
      body: new Uint8Array([1, 2, 3]),
      contentType: "audio/mpeg",
      storageKey: "voice-previews/minimax/preview-hash/male-qn-qingse.mp3",
    });
    expect(deps.insertPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "audio/mpeg",
        format: MINIMAX_VOICE_PREVIEW_FORMAT,
        id: "preview-id",
        model: MINIMAX_VOICE_PREVIEW_MODEL,
        previewText: MINIMAX_VOICE_PREVIEW_TEXT,
        previewTextHash: "preview-hash",
        publicUrl: "/api/public/minimax-voice-previews/preview-id",
        sizeBytes: 3,
        storageKey: "voice-previews/minimax/preview-hash/male-qn-qingse.mp3",
        voice: "male-qn-qingse",
      }),
    );
    expect(result.cached).toBe(false);
    expect(result.url).toBe("/api/public/minimax-voice-previews/preview-id");
  });

  it("reuses the stored row when a concurrent insert wins", async () => {
    const deps = makeDeps({
      insertPreview: vi.fn(() => Promise.resolve(null)),
      loadPreview: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...IDENTITY,
          contentType: "audio/mpeg",
          createdAt: "2026-06-03T00:00:00.000Z",
          id: "winner-id",
          publicUrl: "https://cdn.example.com/winner.mp3",
          sizeBytes: 123,
          storageKey: "winner.mp3",
          updatedAt: "2026-06-03T00:00:00.000Z",
        }),
    });

    const result = await getOrCreateMinimaxVoicePreview({ voice: "male-qn-qingse" }, deps);

    expect(result).toEqual({
      cached: true,
      previewText: MINIMAX_VOICE_PREVIEW_TEXT,
      url: "https://cdn.example.com/winner.mp3",
      voice: "male-qn-qingse",
    });
  });
});
