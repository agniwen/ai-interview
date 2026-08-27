import { describe, expect, it } from "vitest";
import { resolveAiInterviewLinkState } from "./ai-interview-link-state";

const now = new Date("2026-08-27T00:00:00.000Z");

describe("resolveAiInterviewLinkState", () => {
  it("keeps an unexpired pending interview link copyable", () => {
    expect(
      resolveAiInterviewLinkState({
        candidateInviteExpiresAt: "2026-08-28T00:00:00.000Z",
        now,
        status: "pending",
      }),
    ).toEqual({
      copyDisabled: false,
      message: "面试链接有效至 2026年8月28日 08:00",
    });
  });

  it("disables an expired link only when the interview has not started", () => {
    const input = {
      candidateInviteExpiresAt: "2026-08-26T00:00:00.000Z",
      now,
    };

    expect(resolveAiInterviewLinkState({ ...input, status: "pending" })).toEqual({
      copyDisabled: true,
      message: "面试链接已于 2026年8月26日 08:00 过期，请重置沟通后重新复制。",
    });
    expect(resolveAiInterviewLinkState({ ...input, status: "interrupted" }).copyDisabled).toBe(
      false,
    );
    expect(
      resolveAiInterviewLinkState({
        candidateInviteExpiresAt: now.toISOString(),
        now,
        status: "pending",
      }).copyDisabled,
    ).toBe(true);
  });

  it("labels permanent links and keeps them copyable", () => {
    expect(
      resolveAiInterviewLinkState({
        candidateInviteExpiresAt: null,
        now,
        status: "pending",
      }),
    ).toEqual({
      copyDisabled: false,
      message: "面试链接永久有效",
    });
  });
});
