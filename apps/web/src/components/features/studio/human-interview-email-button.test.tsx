// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { HumanInterviewEmailButton } from "./human-interview-email-button";

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
    candidateStatus: "pending",
    html: "<p>正文</p>",
    meetingStatus: "scheduled",
    oldEnd: null,
    oldStart: null,
    options: [
      {
        confirmationToken: "preview-token",
        label: "面试邀请",
        type: "human_candidate_invitation_requested",
      },
    ],
    recipient: "candidate@example.com",
    roundName: "技术一面",
    roundStatus: "pending",
    scheduledAt: "2026-09-20T02:00:00.000Z",
    subject: "邀请",
    validUntil: "2026-09-20T03:00:00.000Z",
  });
  mocks.confirm.mockResolvedValue({ status: "pending" });
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
        <HumanInterviewEmailButton
          slug="test"
          roundId="round"
          meetingId="meeting"
          recordId="record"
          previewEmail={mocks.preview}
          confirmEmail={mocks.confirm}
        />
      </QueryClientProvider>,
    ),
  );
  return { container: document.body };
}
async function click(text: string) {
  await act(() => {
    [...document.querySelectorAll("button")].find((button) => button.textContent === text)?.click();
  });
}
it("opening and cancelling only previews, never sends", async () => {
  const { container } = await setup();
  expect(mocks.preview).not.toHaveBeenCalled();
  await click("邮件通知");
  await act(async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("candidate@example.com"));
  });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("只有点击「确认发送」才会发送邮件");
  expect(container.textContent).not.toContain("正文");
  await click("取消");
  await vi.waitFor(() => expect(container.textContent).not.toContain("发送候选人邮件通知"));
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("sends only after explicit confirmation with the preview token", async () => {
  await setup();
  await click("邮件通知");
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("candidate@example.com"));
  });
  await click("确认发送");
  expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(
    "test",
    "meeting",
    "round",
    "human_candidate_invitation_requested",
    "preview-token",
  );
});

it("selecting another type does not send until confirmation", async () => {
  await setup();
  const initial = await mocks.preview();
  mocks.preview.mockResolvedValue({
    ...initial,
    candidateStatus: "accepted",
    options: [
      {
        confirmationToken: "confirmed-token",
        label: "面试安排确认",
        type: "human_interview_confirmed",
      },
      {
        confirmationToken: "reminder-token",
        label: "面试开始提醒",
        type: "human_interview_reminder",
      },
    ],
  });
  await click("邮件通知");
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("面试开始提醒"));
  });
  await click("面试开始提醒");
  expect(mocks.confirm).not.toHaveBeenCalled();
  await click("确认发送");
  expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(
    "test",
    "meeting",
    "round",
    "human_interview_reminder",
    "reminder-token",
  );
});

it("no available notifications disables confirmation", async () => {
  await setup();
  const initial = await mocks.preview();
  mocks.preview.mockResolvedValue({
    ...initial,
    blockedReason: "已超过本次面试的结束时间，请先调整面试时间，再发送通知。",
    options: [],
  });
  await click("邮件通知");
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("已超过本次面试的结束时间"));
  });
  await click("确认发送");
  expect(mocks.confirm).not.toHaveBeenCalled();
});
