import { describe, expect, it, vi } from "vitest";
import { ensureCandidateAvatar } from "../ensure-candidate-avatar";
import type { EnsureCandidateAvatarDependencies } from "../ensure-candidate-avatar";

const BYTES = new Uint8Array([1, 2, 3]);

function createDependencies(hasRecord: boolean) {
  return {
    extractCandidateAvatar: vi.fn<EnsureCandidateAvatarDependencies["extractCandidateAvatar"]>(() =>
      Promise.resolve("avatar-key"),
    ),
    getApiKey: vi.fn<() => string | null>(() => "jev-test-key"),
    hasAvatarRecord: vi.fn(() => Promise.resolve(hasRecord)),
  } satisfies EnsureCandidateAvatarDependencies;
}

describe("ensureCandidateAvatar", () => {
  it("extracts the avatar for a cached resume that has never been checked", async () => {
    const dependencies = createDependencies(false);
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.pdf", loadBytes },
      dependencies,
    );

    expect(dependencies.hasAvatarRecord).toHaveBeenCalledWith("hash");
    expect(dependencies.extractCandidateAvatar).toHaveBeenCalledWith({
      bytes: BYTES,
      fileName: "resume.pdf",
      mediaType: undefined,
    });
  });

  it("does not call Jev or load the file again once a result is recorded", async () => {
    const dependencies = createDependencies(true);
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.pdf", loadBytes },
      dependencies,
    );

    expect(loadBytes).not.toHaveBeenCalled();
    expect(dependencies.extractCandidateAvatar).not.toHaveBeenCalled();
  });

  it("skips formats without avatar support before touching storage", async () => {
    const dependencies = createDependencies(false);
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.docx", loadBytes },
      dependencies,
    );

    expect(dependencies.hasAvatarRecord).not.toHaveBeenCalled();
    expect(loadBytes).not.toHaveBeenCalled();
  });

  it("swallows storage failures so the cached parse still succeeds", async () => {
    const dependencies = createDependencies(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      ensureCandidateAvatar(
        {
          contentHash: "hash",
          fileName: "resume.pdf",
          loadBytes: () => Promise.reject(new Error("S3 down")),
        },
        dependencies,
      ),
    ).resolves.toBeUndefined();
    expect(dependencies.extractCandidateAvatar).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
