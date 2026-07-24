import { describe, expect, it } from "vitest";
import { isStudioResumeChatId } from "../studio-resume-chat";

describe("studio resume chat helpers", () => {
  it("detects legacy resume-scoped chat ids", () => {
    expect(isStudioResumeChatId("studio-resume:resume_1:user:user_1")).toBe(true);
    expect(isStudioResumeChatId("regular_chat_1")).toBe(false);
  });
});
