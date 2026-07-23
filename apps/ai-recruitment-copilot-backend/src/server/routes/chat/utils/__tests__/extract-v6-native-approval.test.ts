import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { extractV6NativeApproval } from "../extract-v6-native-approval";

describe("extractV6NativeApproval", () => {
  it("returns null when there is no approval response", () => {
    expect(
      extractV6NativeApproval([
        {
          id: "u1",
          parts: [{ text: "分析候选人", type: "text" }],
          role: "user",
        },
      ] as UIMessage[]),
    ).toBeNull();
  });

  it("recovers runId and approved resumeData from approval-responded tool parts", () => {
    const messages = [
      {
        id: "a1",
        parts: [
          {
            approval: {
              approved: true,
              id: "run-abc::tool-call-1",
            },
            state: "approval-responded",
            toolCallId: "tool-call-1",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ] as unknown as UIMessage[];

    expect(extractV6NativeApproval(messages)).toEqual({
      resumeData: { approved: true },
      runId: "run-abc",
    });
  });

  it("includes deny reason when present", () => {
    const messages = [
      {
        id: "a1",
        parts: [
          {
            approval: {
              approved: false,
              id: "run-xyz::tool-call-9",
              reason: "user_ignored",
            },
            state: "approval-responded",
            toolCallId: "tool-call-9",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ] as unknown as UIMessage[];

    expect(extractV6NativeApproval(messages)).toEqual({
      resumeData: { approved: false, reason: "user_ignored" },
      runId: "run-xyz",
    });
  });
});
