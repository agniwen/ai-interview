// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SendInvitationButton } from "./send-invitation-button";

const mocks = { confirm: vi.fn(), preview: vi.fn() };
Object.defineProperty(window, "matchMedia", {
  value: vi.fn().mockImplementation((media: string) => ({
    addEventListener: vi.fn(),
    matches: false,
    media,
    removeEventListener: vi.fn(),
  })),
  writable: true,
});
// SAFETY: React's test-only act flag is set on the jsdom global.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
const clients: QueryClient[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  for (const client of clients.splice(0)) {
    client.clear();
  }
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

async function setup() {
  mocks.preview.mockResolvedValue({
    candidateName: "候选人",
    confirmationToken: "preview-token",
    html: "<p>正文</p>",
    recipient: "candidate@example.com",
    subject: "邀请",
  });
  mocks.confirm.mockResolvedValue({ recordId: "candidate", status: "pending" });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  clients.push(client);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <SendInvitationButton
          slug="test"
          roundId="round"
          previewInvitation={mocks.preview}
          confirmInvitation={mocks.confirm}
        />
      </QueryClientProvider>,
    ),
  );
  return { client, container: document.body };
}
async function click(text: string) {
  await act(() => {
    [...document.querySelectorAll("button")].find((button) => button.textContent === text)?.click();
  });
}
it("opening and cancelling only previews, never sends", async () => {
  const { container } = await setup();
  expect(mocks.preview).not.toHaveBeenCalled();
  await click("发送邮件邀请");
  await act(async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("candidate@example.com"));
  });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("邮件中包含面试链接");
  expect(container.textContent).not.toContain("正文");
  await click("取消");
  await vi.waitFor(() => expect(container.textContent).not.toContain("确认发送面试邀请邮件"));
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("sends only after explicit confirmation with the preview token", async () => {
  const { client } = await setup();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await click("发送邮件邀请");
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("candidate@example.com"));
  });
  await click("确认发送");
  expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith("test", "round", "preview-token");
  await vi.waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["studio-resumes", "test", "timeline", "candidate"],
    }),
  );
});
