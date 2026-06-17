import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const booleanStringSchema = z
  .enum(["1", "true", "yes", "0", "false", "no"])
  .transform((value) => value === "1" || value === "true" || value === "yes");

const defaultTrueBooleanStringSchema = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

export function createClientEnv(runtimeEnv: Record<string, string | boolean | number | undefined>) {
  return createEnv({
    client: {
      NEXT_PUBLIC_AGENT_NAME: z.string().min(1),
      NEXT_PUBLIC_BASE_URL: z.string().url(),
      NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url(),
      NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: defaultTrueBooleanStringSchema,
      NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: booleanStringSchema,
      NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: defaultTrueBooleanStringSchema,
    },
    clientPrefix: "NEXT_PUBLIC_",
    emptyStringAsUndefined: true,
    runtimeEnvStrict: {
      NEXT_PUBLIC_AGENT_NAME: runtimeEnv.NEXT_PUBLIC_AGENT_NAME,
      NEXT_PUBLIC_BASE_URL: runtimeEnv.NEXT_PUBLIC_BASE_URL,
      NEXT_PUBLIC_BETTER_AUTH_URL: runtimeEnv.NEXT_PUBLIC_BETTER_AUTH_URL,
      NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS:
        runtimeEnv.NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS,
      NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: runtimeEnv.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN,
      NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: runtimeEnv.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING,
    },
  });
}
