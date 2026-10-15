import { describe, expect, it, vi } from "vitest";
import { ensureCandidateAvatar } from "../ensure-candidate-avatar";
import type {
  CandidateAvatarAttempt,
  EnsureCandidateAvatarDependencies,
} from "../ensure-candidate-avatar";

const BYTES = new Uint8Array([1, 2, 3]);

function createDependencies(attempt: CandidateAvatarAttempt | null) {
  return {
    extractCandidateAvatar: vi.fn<EnsureCandidateAvatarDependencies["extractCandidateAvatar"]>(() =>
      Promise.resolve("avatar-key"),
    ),
    getApiKey: vi.fn<() => string | null>(() => "jev-test-key"),
    loadAvatarAttempt: vi.fn(() => Promise.resolve(attempt)),
  } satisfies EnsureCandidateAvatarDependencies;
}

describe("ensureCandidateAvatar", () => {
  it("extracts the avatar for a cached resume that has never been checked", async () => {
    const dependencies = createDependencies(null);
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.pdf", loadBytes },
      dependencies,
    );

    expect(dependencies.loadAvatarAttempt).toHaveBeenCalledWith("hash");
    expect(dependencies.extractCandidateAvatar).toHaveBeenCalledWith({
      bytes: BYTES,
      fileName: "resume.pdf",
      mediaType: undefined,
    });
  });

  it.each([
    ["an avatar was detected", { attempts: 1, status: "detected" }],
    ["no avatar was found", { attempts: 1, status: "not_detected" }],
    ["failures reached the retry limit", { attempts: 3, status: "failed" }],
  ] as const)("does not call Jev or load the file again once %s", async (_label, attempt) => {
    const dependencies = createDependencies(attempt);
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.pdf", loadBytes },
      dependencies,
    );

    expect(loadBytes).not.toHaveBeenCalled();
    expect(dependencies.extractCandidateAvatar).not.toHaveBeenCalled();
  });

  it("retries a resume whose earlier extraction failed", async () => {
    const dependencies = createDependencies({ attempts: 2, status: "failed" });
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.pdf", loadBytes },
      dependencies,
    );

    expect(dependencies.extractCandidateAvatar).toHaveBeenCalledOnce();
  });

  it("skips formats without avatar support before touching storage", async () => {
    const dependencies = createDependencies(null);
    const loadBytes = vi.fn(() => Promise.resolve(BYTES));

    await ensureCandidateAvatar(
      { contentHash: "hash", fileName: "resume.docx", loadBytes },
      dependencies,
    );

    expect(dependencies.loadAvatarAttempt).not.toHaveBeenCalled();
    expect(loadBytes).not.toHaveBeenCalled();
  });

  it("swallows storage failures so the cached parse still succeeds", async () => {
    const dependencies = createDependencies(null);
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
