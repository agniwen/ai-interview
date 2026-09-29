// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Isolate transport and persisted message loading from the chat UI. */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanMeetingChat } from "./human-meeting-chat";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chat = vi.hoisted(() => ({
  invalidate: vi.fn(),
  // SAFETY: The empty test message list is intentionally typed for later LiveKit notifications.
  liveMessages: [] as { id: string }[],
  messages: [
    {
      id: "message-1",
      message: "你好",
      participantIdentity: "candidate",
      senderName: "候选人",
      timestamp: "2026-09-29T02:00:00.000Z",
    },
  ],
  mobile: false,
  save: vi.fn(),
  send: vi.fn(),
  setQueryData: vi.fn(),
}));

vi.mock("@livekit/components-react", () => ({
  useChat: () => ({ chatMessages: chat.liveMessages, send: chat.send }),
  useRoomContext: () => ({ localParticipant: { identity: "host" } }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { messages: chat.messages },
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: chat.invalidate, setQueryData: chat.setQueryData }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => chat.mobile }));
vi.mock("@/lib/client/api/endpoints/human-interview-chat", () => ({
  fetchHumanInterviewChatMessages: vi.fn(),
  saveHumanInterviewChatMessage: chat.save,
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, direction }: { children: React.ReactNode; direction?: string }) => (
    <div data-direction={direction} data-testid="drawer">
      {children}
    </div>
  ),
  DrawerContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  chat.mobile = false;
  chat.save.mockReset();
  chat.send.mockReset();
  chat.setQueryData.mockReset();
  chat.invalidate.mockReset();
  vi.unstubAllGlobals();
});

function renderChat() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <HumanMeetingChat
        access={{ inviteToken: "invite-1", mode: "interviewer" }}
        open
        onClose={() => {}}
      />,
    ),
  );
  return container;
}

describe("HumanMeetingChat", () => {
  it("shows persisted messages and saves before notifying LiveKit", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
    chat.save.mockResolvedValue({
      message: {
        id: "00000000-0000-4000-8000-000000000001",
        message: "你好，面试官",
        participantIdentity: "host",
        senderName: "面试官",
        timestamp: "2026-09-29T02:01:00.000Z",
      },
    });
    chat.send.mockResolvedValue({});
    const container = renderChat();
    expect(container.textContent).toContain("候选人");
    expect(container.textContent).toContain("你好");
    expect(container.textContent).not.toContain("聊天记录不会自动保存");

    const field = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="输入聊天消息"]',
    );
    if (!field) {
      throw new Error("找不到聊天输入框");
    }
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        field,
        "  你好，面试官  ",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="发送消息"]')?.click();
      await Promise.resolve();
    });
    expect(chat.save).toHaveBeenCalledWith(
      { inviteToken: "invite-1", mode: "interviewer" },
      { id: "00000000-0000-4000-8000-000000000001", message: "你好，面试官" },
    );
    expect(chat.send).toHaveBeenCalledWith("你好，面试官", {
      attributes: { persistedMessageId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(chat.save.mock.invocationCallOrder[0]).toBeLessThan(
      chat.send.mock.invocationCallOrder[0],
    );
    expect(field.value).toBe("");
  });

  it("uses a full-screen drawer on mobile with a close button at the top left", () => {
    chat.mobile = true;
    const container = renderChat();
    const drawer = container.querySelector<HTMLElement>('[data-slot="meeting-chat-panel"]');
    expect(container.querySelector<HTMLElement>('[data-testid="drawer"]')?.dataset.direction).toBe(
      "bottom",
    );
    expect(drawer?.className).toContain("!inset-0");
    expect(drawer?.querySelector("button")?.getAttribute("aria-label")).toBe("关闭聊天");
  });
});
