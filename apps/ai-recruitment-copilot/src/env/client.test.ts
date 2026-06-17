import { describe, expect, it } from "vitest";
import { createClientEnv } from "./client.schema";

const configuredEnv = {
  NEXT_PUBLIC_AGENT_NAME: "interview-agent",
  NEXT_PUBLIC_BASE_URL: "https://app.example.com",
  NEXT_PUBLIC_BETTER_AUTH_URL: "https://app.example.com",
  NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: "false",
};

describe("client env", () => {
  it("requires all public client env values", () => {
    expect(() => createClientEnv({})).toThrow();

    const env = createClientEnv(configuredEnv);

    expect(env.NEXT_PUBLIC_BASE_URL).toBe("https://app.example.com");
    expect(env.NEXT_PUBLIC_BETTER_AUTH_URL).toBe("https://app.example.com");
    expect(env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(false);
    expect(env.NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS).toBe(true);
    expect(env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING).toBe(true);
    expect(env.NEXT_PUBLIC_AGENT_NAME).toBe("interview-agent");
  });

  it("allows disabling candidate-specific interview question generation from public env", () => {
    const env = createClientEnv({
      ...configuredEnv,
      NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: "false",
    });

    expect(env.NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS).toBe(false);
  });

  it("allows disabling interview recording from public env", () => {
    const env = createClientEnv({
      ...configuredEnv,
      NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: "false",
    });

    expect(env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING).toBe(false);
  });

  it("rejects unknown keys at typecheck time", () => {
    type EnvName = keyof ReturnType<typeof createClientEnv>;
    const validName: EnvName = "NEXT_PUBLIC_BASE_URL";
    // @ts-expect-error Only declared client env names should be accepted.
    const invalidName: EnvName = "NOT_DECLARED_ENV";

    expect(validName).toBe("NEXT_PUBLIC_BASE_URL");
    expect(invalidName).toBe("NOT_DECLARED_ENV");
  });
});
