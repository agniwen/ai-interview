import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { extractNativeApproval } from "../extract-native-approval";

describe("extractNativeApproval", () => {
  it("returns null when there is no approval response", () => {
    expect(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      extractNativeApproval([
        {
          id: "u1",
          parts: [{ text: "分析候选人", type: "text" }],
          role: "user",
        },
      ] as UIMessage[]),
    ).toBeNull();
  });

  it("recovers runId and approved resumeData from approval-responded tool parts", () => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const messages = [
      {
        id: "a1",
        parts: [
          {
            approval: {
              approved: true,
              id: "run-abc::tool-call-1",
            },
            input: {},
            state: "approval-responded",
            toolCallId: "tool-call-1",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ] as UIMessage[];

    expect(extractNativeApproval(messages)).toEqual({
      resumeData: { approved: true },
      runId: "run-abc",
      toolCallId: "tool-call-1",
    });
  });

  it("includes deny reason when present", () => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
            input: {},
            state: "approval-responded",
            toolCallId: "tool-call-9",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ] as UIMessage[];

    expect(extractNativeApproval(messages)).toEqual({
      resumeData: { approved: false, reason: "user_ignored" },
      runId: "run-xyz",
      toolCallId: "tool-call-9",
    });
  });

  it.each(["run-1::different-tool", "run-1::", "::tool-1", "tool-1"])(
    "ignores an approval ID that does not identify this tool: %s",
    (approvalId) => {
      const messages: UIMessage[] = [
        {
          id: "a1",
          parts: [
            {
              approval: { approved: true, id: approvalId },
              input: {},
              state: "approval-responded",
              toolCallId: "tool-1",
              type: "tool-propose_recruiting_action",
            },
          ],
          role: "assistant",
        },
      ];

      expect(extractNativeApproval(messages)).toBeNull();
    },
  );
});
