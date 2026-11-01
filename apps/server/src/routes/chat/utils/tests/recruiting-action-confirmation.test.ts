import { describe, expect, it } from "vitest";
import type { ArcMessage } from "@app/db-schema/ai-message";
import type { JsonValue } from "@app/db-schema/json";
import {
  deriveRecruitingActionConfirmationsFromMessages,
  hasPendingRecruitingBindProposal,
  patchArcMessageRecruitingActionConfirmation,
} from "../recruiting-action-confirmation";

type ArcMessageFixture = Readonly<Record<string, JsonValue | undefined>>;

function asArcMessage(value: ArcMessageFixture): ArcMessage {
  // SAFETY: The helper fills only the message fields exercised by this test.
  const partial = { ...({} as Partial<ArcMessage>), ...value };
  // SAFETY: The fixture is passed to the production parser only after this test boundary.
  return partial as ArcMessage;
}

function asArcMessages(values: ArcMessageFixture[]): ArcMessage[] {
  return values.map(asArcMessage);
}

describe("recruiting-action-confirmation", () => {
  it("patches AI SDK tool-* part output with confirmation", () => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const messageFixture = {
      id: "msg-1",
      parts: [
        {
          output: {
            proposal: {
              explanation: "选岗位",
              id: "conversation-bind:resume_record:r1",
              payload: { resumeRecordId: "r1" },
              title: "关联",
              type: "bind_candidate_to_job",
            },
          },
          state: "output-available",
          toolCallId: "call-1",
          type: "tool-propose_recruiting_action",
        },
      ],
      role: "assistant",
    };
    const message = asArcMessage(messageFixture);

    const next = patchArcMessageRecruitingActionConfirmation(
      message,
      "conversation-bind:resume_record:r1",
      {
        confirmedAt: "2026-07-23T00:00:00.000Z",
        jobDescriptionId: "jd-1",
        jobDescriptionName: "前端",
        status: "confirmed",
      },
    );

    expect(next?.parts[0]).toMatchObject({
      output: {
        confirmation: {
          jobDescriptionId: "jd-1",
          status: "confirmed",
        },
        proposal: {
          payload: {
            jobDescriptionId: "jd-1",
            resumeRecordId: "r1",
          },
        },
      },
      type: "tool-propose_recruiting_action",
    });
  });

  it("derives later confirmations for the same proposal id", () => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const messageFixtures = [
      {
        id: "1",
        parts: [
          {
            output: {
              confirmation: {
                confirmedAt: "2026-07-23T00:00:00.000Z",
                status: "ignored",
              },
              proposal: { id: "p1" },
            },
            state: "output-available",
            toolCallId: "call-1",
            toolName: "propose_recruiting_action",
            type: "tool",
          },
        ],
        role: "assistant",
      },
      {
        id: "2",
        parts: [
          {
            output: {
              confirmation: {
                confirmedAt: "2026-07-23T01:00:00.000Z",
                jobDescriptionId: "jd-1",
                status: "confirmed",
              },
              proposal: { id: "p1" },
            },
            state: "output-available",
            toolCallId: "call-2",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ];
    const messages = asArcMessages(messageFixtures);

    expect(deriveRecruitingActionConfirmationsFromMessages(messages)).toEqual({
      p1: {
        confirmedAt: "2026-07-23T01:00:00.000Z",
        jobDescriptionId: "jd-1",
        status: "confirmed",
      },
    });
  });

  it("treats confirmed bind proposals as no longer pending", () => {
    expect(
      hasPendingRecruitingBindProposal({
        proposal: { id: "p1", type: "bind_pool_item_to_job" },
      }),
    ).toBe(true);

    expect(
      hasPendingRecruitingBindProposal({
        confirmation: { confirmedAt: "x", status: "confirmed" },
        proposal: { id: "p1", type: "bind_pool_item_to_job" },
      }),
    ).toBe(false);
  });
});
