import { describe, expect, it } from "vitest";
import type { ArcMessage } from "@arc/db-schema/ai-message";
import {
  RECRUITING_CONTEXT_JOB_BINDING_META_KEY,
  deriveChatContextBindingsFromMessages,
} from "@arc/db-schema/chat-context-bindings";

describe("deriveChatContextBindingsFromMessages", () => {
  it("derives later bindings over earlier ones for the same person", () => {
    const messages: ArcMessage[] = [
      {
        id: "1",
        metadata: {
          [RECRUITING_CONTEXT_JOB_BINDING_META_KEY]: {
            jobDescriptionId: "jd-old",
            kind: "resume_pool_item",
            recordId: "pool-1",
          },
        },
        parts: [{ text: "old", type: "text" }],
        role: "assistant",
      },
      {
        id: "2",
        metadata: {
          [RECRUITING_CONTEXT_JOB_BINDING_META_KEY]: {
            jobDescriptionId: "jd-new",
            kind: "resume_pool_item",
            recordId: "pool-1",
          },
        },
        parts: [{ text: "new", type: "text" }],
        role: "assistant",
      },
      {
        id: "3",
        metadata: {
          [RECRUITING_CONTEXT_JOB_BINDING_META_KEY]: {
            jobDescriptionId: "jd-2",
            kind: "resume_record",
            recordId: "resume-1",
          },
        },
        parts: [{ text: "resume", type: "text" }],
        role: "assistant",
      },
    ];

    expect(deriveChatContextBindingsFromMessages(messages)).toEqual({
      resume_pool_item: { "pool-1": "jd-new" },
      resume_record: { "resume-1": "jd-2" },
    });
  });
});
