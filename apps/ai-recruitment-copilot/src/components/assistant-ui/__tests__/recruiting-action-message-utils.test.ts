import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  lastAssistantHasPendingRecruitingBindProposal,
  patchUiMessagesRecruitingActionConfirmation,
} from "../recruiting-action-message-utils";

describe("recruiting-action-message-utils", () => {
  it("patches confirmation into propose tool parts and detects pending proposals", () => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const messages = [
      {
        id: "a1",
        parts: [
          {
            input: {},
            output: {
              proposal: {
                id: "p1",
                payload: { poolItemId: "pool-1" },
                type: "bind_pool_item_to_job",
              },
            },
            state: "output-available",
            toolCallId: "c1",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ] as UIMessage[];

    expect(lastAssistantHasPendingRecruitingBindProposal(messages)).toBe(true);

    const next = patchUiMessagesRecruitingActionConfirmation(messages, "p1", {
      confirmedAt: "2026-07-23T00:00:00.000Z",
      jobDescriptionId: "jd-1",
      jobDescriptionName: "用户运营经理",
      status: "confirmed",
    });

    expect(lastAssistantHasPendingRecruitingBindProposal(next)).toBe(false);
    expect(next[0]?.parts[0]).toMatchObject({
      output: {
        confirmation: { status: "confirmed" },
        proposal: {
          payload: { jobDescriptionId: "jd-1", poolItemId: "pool-1" },
        },
      },
    });
  });
});
