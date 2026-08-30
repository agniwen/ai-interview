import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { shouldAutomaticallyContinueChat } from "../lib/chat-registry";

describe("shouldAutomaticallyContinueChat", () => {
  it("does not start another request after a server-executed tool completes", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        parts: [
          {
            input: { id: "resume-1" },
            output: { resumeRecord: null },
            state: "output-available",
            toolCallId: "tool-1",
            type: "tool-get_resume_record_detail",
          },
        ],
        role: "assistant",
      },
    ];

    expect(shouldAutomaticallyContinueChat({ messages })).toBe(false);
  });

  it("resumes after the user responds to a native tool approval", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        parts: [
          {
            approval: { approved: true, id: "approval-1" },
            input: { type: "bind_candidate_to_job" },
            state: "approval-responded",
            toolCallId: "tool-1",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      },
    ];

    expect(shouldAutomaticallyContinueChat({ messages })).toBe(true);
  });
});
