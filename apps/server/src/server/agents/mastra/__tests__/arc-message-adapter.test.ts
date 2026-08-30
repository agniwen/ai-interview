import { describe, expect, it } from "vitest";
import {
  arcMessageToMastraInput,
  legacyUiMessageToArcMessage,
  mastraStreamToArcMessageParts,
} from "@app/server/server/agents/mastra/adapters/arc-message-adapter";

describe("Arc message adapter", () => {
  it("builds a compact Mastra message input from ArcMessage parts", () => {
    expect(
      arcMessageToMastraInput({
        id: "message-1",
        parts: [
          { text: "请分析这份简历。", type: "text" },
          {
            filename: "resume.pdf",
            mediaType: "application/pdf",
            type: "file",
            url: "s3://bucket/resume.pdf",
          },
        ],
        role: "user",
      }),
    ).toEqual({
      content: "请分析这份简历。\n[file:resume.pdf application/pdf s3://bucket/resume.pdf]",
      id: "message-1",
      role: "user",
    });
  });

  it("normalizes generic Mastra stream chunks into ArcMessage parts", () => {
    expect(
      mastraStreamToArcMessageParts([
        { text: "hello", type: "text" },
        { delta: "thinking", type: "reasoning-delta" },
        {
          output: { ok: true },
          state: "output-available",
          toolCallId: "tool-1",
          toolName: "lookupResume",
          type: "tool",
        },
        { title: "source", type: "source", url: "https://example.com" },
      ]),
    ).toEqual([
      { text: "hello", type: "text" },
      { text: "thinking", type: "reasoning" },
      {
        output: { ok: true },
        state: "output-available",
        toolCallId: "tool-1",
        toolName: "lookupResume",
        type: "tool",
      },
      { title: "source", type: "source", url: "https://example.com" },
    ]);
  });

  it("converts legacy UI message fields into ArcMessage", () => {
    expect(
      legacyUiMessageToArcMessage({
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "message-1",
        metadata: { source: "test" },
        parts: [{ text: "hello", type: "text" }],
        role: "user",
      }),
    ).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "message-1",
      metadata: { source: "test" },
      parts: [{ text: "hello", type: "text" }],
      role: "user",
    });
  });

  it("preserves AI SDK v6 tool parts for persistence and reload", () => {
    expect(
      legacyUiMessageToArcMessage({
        id: "message-v6",
        parts: [
          { type: "step-start" },
          { text: "先读取候选人。", type: "text" },
          {
            input: { id: "resume-1", presentation: "context" },
            output: { resumeRecord: { id: "resume-1" } },
            state: "output-available",
            toolCallId: "tool-1",
            type: "tool-get_resume_record_detail",
          },
        ],
        role: "assistant",
      }).parts,
    ).toEqual([
      { type: "step-start" },
      { text: "先读取候选人。", type: "text" },
      {
        input: { id: "resume-1", presentation: "context" },
        output: { resumeRecord: { id: "resume-1" } },
        state: "output-available",
        toolCallId: "tool-1",
        type: "tool-get_resume_record_detail",
      },
    ]);
  });

  it("preserves AI SDK v6 approval states", () => {
    expect(
      legacyUiMessageToArcMessage({
        id: "message-approval",
        parts: [
          {
            approval: { id: "approval-1" },
            input: { type: "bind_candidate_to_job" },
            state: "approval-requested",
            toolCallId: "tool-approval",
            type: "tool-propose_recruiting_action",
          },
        ],
        role: "assistant",
      }).parts,
    ).toEqual([
      {
        approval: { id: "approval-1" },
        input: { type: "bind_candidate_to_job" },
        state: "approval-requested",
        toolCallId: "tool-approval",
        type: "tool-propose_recruiting_action",
      },
    ]);
  });

  it("falls back to a text part for legacy content strings", () => {
    expect(
      legacyUiMessageToArcMessage({
        content: "hello",
        id: "message-1",
        role: "assistant",
      }).parts,
    ).toEqual([{ text: "hello", type: "text" }]);
  });

  it("rejects messages without supported roles", () => {
    expect(() =>
      legacyUiMessageToArcMessage({
        id: "message-1",
        parts: [],
        role: "invalid",
      }),
    ).toThrow("Unsupported ArcMessage role: invalid");
  });
});
