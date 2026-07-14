import { describe, expect, it } from "vitest";
import { isModelNotAllowedError } from "../is-model-not-allowed";

// The wire-level code the server emits on a 422. Kept as a local literal so this
// browser-side test never imports server-only agent-builder EE code.
const MODEL_NOT_ALLOWED_CODE = "MODEL_NOT_ALLOWED";

describe("isModelNotAllowedError", () => {
  it("returns details for a 422 + MODEL_NOT_ALLOWED body", () => {
    const err = {
      body: {
        error: {
          attempted: { modelId: "gpt-4o", provider: "openai" },
          code: MODEL_NOT_ALLOWED_CODE,
          message: "Model openai/gpt-4o is not in the allowed list",
          offendingLabel: "openai/gpt-4o",
        },
      },
      status: 422,
    };

    expect(isModelNotAllowedError(err)).toEqual({
      attempted: { modelId: "gpt-4o", provider: "openai" },
      message: "Model openai/gpt-4o is not in the allowed list",
      offendingLabel: "openai/gpt-4o",
    });
  });

  it("returns null for non-422 errors", () => {
    expect(
      isModelNotAllowedError({ body: { error: { code: MODEL_NOT_ALLOWED_CODE } }, status: 500 }),
    ).toBeNull();
  });

  it("returns null when code does not match", () => {
    expect(isModelNotAllowedError({ body: { error: { code: "OTHER" } }, status: 422 })).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(isModelNotAllowedError(null)).toBeNull();
    expect(isModelNotAllowedError()).toBeNull();
    expect(isModelNotAllowedError("boom")).toBeNull();
  });

  it("falls back to a generic message when body is missing message", () => {
    const result = isModelNotAllowedError({
      body: { error: { code: MODEL_NOT_ALLOWED_CODE } },
      status: 422,
    });
    expect(result?.message).toBe("Model not allowed by admin policy");
  });
});
