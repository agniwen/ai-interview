import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStudioResumeChatId,
  isStudioResumeChatId,
  openStudioResumeChat,
  STUDIO_RESUME_CHAT_EVENT,
} from "../studio-resume-chat";

describe("studio resume chat helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds deterministic conversation ids scoped to the resume and user", () => {
    expect(buildStudioResumeChatId({ recordId: "resume_1", userId: "user_1" })).toBe(
      "studio-resume:resume_1:user:user_1",
    );
    expect(isStudioResumeChatId("studio-resume:resume_1:user:user_1")).toBe(true);
    expect(isStudioResumeChatId("regular_chat_1")).toBe(false);
  });

  it("dispatches a pending resume-chat launch without creating a conversation id", () => {
    const listener = vi.fn();
    vi.stubGlobal("window", new EventTarget());
    window.addEventListener(STUDIO_RESUME_CHAT_EVENT, listener);

    openStudioResumeChat({ candidateName: "张三", recordId: "resume_1" });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({ candidateName: "张三", recordId: "resume_1" });

    window.removeEventListener(STUDIO_RESUME_CHAT_EVENT, listener);
  });
});
