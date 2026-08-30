import { describe, expect, it } from "vitest";
import {
  buildMastraMemoryScope,
  toMastraRequestContext,
} from "@app/server/server/agents/mastra/request-context";

describe("Mastra request context", () => {
  it("keeps only present contextual identifiers", () => {
    const context = toMastraRequestContext({
      conversationId: "",
      extra: { empty: "", feature: "resume-chat" },
      resumeRecordId: undefined,
      userId: "user-1",
      workspaceId: " workspace-1 ",
      workspaceSlug: "starrail",
    });

    expect(Object.fromEntries(context)).toEqual({
      feature: "resume-chat",
      userId: "user-1",
      workspaceId: "workspace-1",
      workspaceSlug: "starrail",
    });
  });

  it("builds stable memory resource and thread ids for workspace chat", () => {
    expect(
      buildMastraMemoryScope({
        conversationId: "conversation-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      resource: "workspace:workspace-1:user:user-1",
      thread: "conversation:conversation-1",
    });
  });

  it("includes resume identity in resume-scoped chat threads", () => {
    expect(
      buildMastraMemoryScope({
        conversationId: "conversation-1",
        resumeRecordId: "resume-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      resource: "workspace:workspace-1:user:user-1",
      thread: "resume:resume-1:conversation:conversation-1",
    });
  });
});
