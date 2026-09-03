import { afterEach, describe, expect, it } from "vitest";
import { getBooleanEnv, getRequiredBooleanEnv, getRequiredEnv } from "../env";

const ORIGINAL_ALIBABA_MODEL = process.env.ALIBABA_MODEL;
const ORIGINAL_S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE;

afterEach(() => {
  if (ORIGINAL_ALIBABA_MODEL === undefined) {
    delete process.env.ALIBABA_MODEL;
  } else {
    process.env.ALIBABA_MODEL = ORIGINAL_ALIBABA_MODEL;
  }
  if (ORIGINAL_S3_FORCE_PATH_STYLE === undefined) {
    delete process.env.S3_FORCE_PATH_STYLE;
  } else {
    process.env.S3_FORCE_PATH_STYLE = ORIGINAL_S3_FORCE_PATH_STYLE;
  }
});

describe("getRequiredEnv", () => {
  it("returns a trimmed configured value", () => {
    process.env.ALIBABA_MODEL = " configured ";

    expect(getRequiredEnv("ALIBABA_MODEL")).toBe("configured");
  });

  it("throws when the value is missing or blank", () => {
    process.env.ALIBABA_MODEL = " ";

    expect(() => getRequiredEnv("ALIBABA_MODEL")).toThrow("ALIBABA_MODEL is not configured.");
  });

  it("parses required boolean values without defaults", () => {
    process.env.S3_FORCE_PATH_STYLE = "false";

    expect(getRequiredBooleanEnv("S3_FORCE_PATH_STYLE")).toBe(false);

    delete process.env.S3_FORCE_PATH_STYLE;
    expect(() => getRequiredBooleanEnv("S3_FORCE_PATH_STYLE")).toThrow(
      "S3_FORCE_PATH_STYLE is not configured.",
    );
  });

  it("uses a boolean default only when the value is missing or blank", () => {
    delete process.env.S3_FORCE_PATH_STYLE;
    expect(getBooleanEnv("S3_FORCE_PATH_STYLE", false)).toBe(false);

    process.env.S3_FORCE_PATH_STYLE = " ";
    expect(getBooleanEnv("S3_FORCE_PATH_STYLE", false)).toBe(false);

    process.env.S3_FORCE_PATH_STYLE = "true";
    expect(getBooleanEnv("S3_FORCE_PATH_STYLE", false)).toBe(true);
  });

  it("rejects unknown keys at typecheck time", () => {
    type EnvName = Parameters<typeof getRequiredEnv>[0];
    const validName: EnvName = "ALIBABA_MODEL";
    // @ts-expect-error Only declared server env names should be accepted.
    const invalidName: EnvName = "NOT_DECLARED_ENV";

    expect(validName).toBe("ALIBABA_MODEL");
    expect(invalidName).toBe("NOT_DECLARED_ENV");
  });
});
