import { describe, expect, it, vi } from "vitest";
import { extractCandidateAvatar } from "../extract-candidate-avatar";
import type { CandidateAvatarDependencies } from "../extract-candidate-avatar";
import type { HeadshotLocation } from "../qwen-headshot";

const PDF_INPUT = {
  bytes: new Uint8Array([1, 2, 3]),
  fileName: "resume.pdf",
  mediaType: "application/pdf",
};
const AVATAR_JPEG = new Uint8Array([9, 9, 9]);

function headshot(
  overrides: { personConfidence?: number; photoProbability?: number } = {},
): HeadshotLocation {
  return {
    model: "qwen3-vl-plus",
    person: {
      box: { bottom: 0.35, left: 0.08, right: 0.27, top: 0.12 },
      confidence: overrides.personConfidence ?? 0.92,
    },
    photo: { box: { bottom: 0.4, left: 0.05, right: 0.3, top: 0.1 }, confidence: 0.9 },
    photoProbability: overrides.photoProbability ?? 0.95,
  };
}

function createDependencies(location: HeadshotLocation | Error = headshot()) {
  const cropAvatarJpeg = vi.fn(() => AVATAR_JPEG);
  const dependencies = {
    getApiKey: vi.fn<() => string | null>(() => "dashscope-test-key"),
    hashBytes: vi.fn(() => Promise.resolve("content-hash")),
    locateHeadshot: vi.fn(() =>
      location instanceof Error ? Promise.reject(location) : Promise.resolve(location),
    ),
    now: vi.fn<() => number>().mockReturnValueOnce(1000).mockReturnValueOnce(3400),
    saveAvatarRecord: vi.fn(() => Promise.resolve()),
    storeAvatarImage: vi.fn(() => Promise.resolve("prefix/candidate-avatars/content-hash.jpg")),
    withFirstPageImage: vi.fn((_source, use) =>
      use({ cropAvatarJpeg, height: 1560, png: new Uint8Array([5]), width: 1103 }),
    ),
  } satisfies CandidateAvatarDependencies;
  return { cropAvatarJpeg, dependencies };
}

describe("extractCandidateAvatar", () => {
  it("stores a confident headshot and records its storage key", async () => {
    const { cropAvatarJpeg, dependencies } = createDependencies();

    await expect(extractCandidateAvatar(PDF_INPUT, dependencies)).resolves.toBe(
      "prefix/candidate-avatars/content-hash.jpg",
    );
    expect(cropAvatarJpeg).toHaveBeenCalledWith(headshot());
    expect(dependencies.storeAvatarImage).toHaveBeenCalledWith("content-hash", AVATAR_JPEG);
    expect(dependencies.saveAvatarRecord).toHaveBeenCalledWith({
      boxConfidence: 0.92,
      contentHash: "content-hash",
      durationMs: 2400,
      errorMessage: null,
      model: "qwen3-vl-plus",
      photoProbability: 0.95,
      status: "detected",
      storageKey: "prefix/candidate-avatars/content-hash.jpg",
    });
  });

  it.each([
    ["photo probability", { photoProbability: 0.49 }],
    ["person box confidence", { personConfidence: 0.49 }],
  ])("treats a %s below 0.5 as no avatar", async (_label, overrides) => {
    const { cropAvatarJpeg, dependencies } = createDependencies(headshot(overrides));

    await expect(extractCandidateAvatar(PDF_INPUT, dependencies)).resolves.toBeNull();
    expect(cropAvatarJpeg).not.toHaveBeenCalled();
    expect(dependencies.storeAvatarImage).not.toHaveBeenCalled();
    expect(dependencies.saveAvatarRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHash: "content-hash",
        status: "not_detected",
        storageKey: null,
      }),
    );
  });

  it("treats an answer without a person box as no avatar", async () => {
    const { cropAvatarJpeg, dependencies } = createDependencies({ ...headshot(), person: null });

    await expect(extractCandidateAvatar(PDF_INPUT, dependencies)).resolves.toBeNull();
    expect(cropAvatarJpeg).not.toHaveBeenCalled();
    expect(dependencies.saveAvatarRecord).toHaveBeenCalledWith(
      expect.objectContaining({ boxConfidence: null, status: "not_detected" }),
    );
  });

  it("records the failure reason and duration when the model call fails", async () => {
    const { dependencies } = createDependencies(new Error("503 upstream unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(extractCandidateAvatar(PDF_INPUT, dependencies)).resolves.toBeNull();
    expect(dependencies.saveAvatarRecord).toHaveBeenCalledWith({
      boxConfidence: null,
      contentHash: "content-hash",
      durationMs: 2400,
      errorMessage: "Error: 503 upstream unavailable",
      model: null,
      photoProbability: null,
      status: "failed",
      storageKey: null,
    });
    warn.mockRestore();
  });

  it("still resolves to null when recording the failure also fails", async () => {
    const { dependencies } = createDependencies(new Error("network down"));
    dependencies.saveAvatarRecord.mockRejectedValue(new Error("database unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(extractCandidateAvatar(PDF_INPUT, dependencies)).resolves.toBeNull();
    warn.mockRestore();
  });

  it("skips extraction entirely when the model key is not configured", async () => {
    const { dependencies } = createDependencies();
    dependencies.getApiKey.mockReturnValue(null);

    await expect(extractCandidateAvatar(PDF_INPUT, dependencies)).resolves.toBeNull();
    expect(dependencies.withFirstPageImage).not.toHaveBeenCalled();
  });

  it("uses an image resume as its own first page", async () => {
    const { dependencies } = createDependencies();
    const bytes = new Uint8Array([8]);

    await extractCandidateAvatar(
      { bytes, fileName: "resume.png", mediaType: "image/png" },
      dependencies,
    );

    expect(dependencies.withFirstPageImage).toHaveBeenCalledWith(
      { bytes, mediaType: "image/png" },
      expect.any(Function),
    );
  });

  it.each([
    ["Word", "resume.docx"],
    ["HTML", "resume.html"],
  ])("does not attempt %s resumes", async (_label, fileName) => {
    const { dependencies } = createDependencies();

    await expect(
      extractCandidateAvatar({ bytes: new Uint8Array([1]), fileName }, dependencies),
    ).resolves.toBeNull();
    expect(dependencies.withFirstPageImage).not.toHaveBeenCalled();
    expect(dependencies.locateHeadshot).not.toHaveBeenCalled();
  });
});
