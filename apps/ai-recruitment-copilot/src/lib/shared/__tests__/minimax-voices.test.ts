import {
  MINIMAX_INTERVIEWER_VOICES,
  MINIMAX_VOICES,
  minimaxVoiceSchema,
} from "@arc/db-schema/minimax-voices";
import { describe, expect, test } from "vitest";

describe("MINIMAX_INTERVIEWER_VOICES", () => {
  test("limits interviewer choices to formal adult voices", () => {
    const interviewerVoiceIds = new Set(MINIMAX_INTERVIEWER_VOICES.map((voice) => voice.id));

    expect(interviewerVoiceIds.has("voice_agent_Male_Phone_1")).toBe(true);
    expect(interviewerVoiceIds.has("Chinese (Mandarin)_Reliable_Executive")).toBe(true);
    expect(interviewerVoiceIds.has("clever_boy")).toBe(false);
    expect(interviewerVoiceIds.has("cartoon_pig")).toBe(false);
    expect(interviewerVoiceIds.has("Chinese (Mandarin)_Warm_Girl")).toBe(false);
    expect(interviewerVoiceIds.has("Chinese (Mandarin)_Humorous_Elder")).toBe(false);
  });

  test("keeps the full voice schema compatible with existing records", () => {
    expect(MINIMAX_VOICES.some((voice) => voice.id === "clever_boy")).toBe(true);
    expect(minimaxVoiceSchema.safeParse("clever_boy").success).toBe(true);
  });
});
