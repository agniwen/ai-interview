// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Observe notifications without rendering Sonner's portal. */
import type { ReceivedMessage } from "@livekit/components-react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useInterviewConnectionNotifications } from "../use-interview-connection-notifications";
import { interviewConnectionState } from "../interview-connection-status";

vi.mock("sonner", () => ({ toast: { dismiss: vi.fn(), loading: vi.fn(), success: vi.fn() } }));
// SAFETY: React test environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function status(id: string, state: string, isAgent = true): ReceivedMessage {
  return {
    attributes: { "interview.connection_state": state },
    // SAFETY: Only the authenticated participant's agent flag is read by this test.
    from: { isAgent } as NonNullable<ReceivedMessage["from"]>,
    id,
    message: "status",
    timestamp: 1,
    type: "agentTranscript",
  };
}
function Probe({ messages }: { messages: ReceivedMessage[] }) {
  useInterviewConnectionNotifications(messages);
  return null;
}
it("replaces reconnecting with success once, ignores untrusted senders, and cleans up", () => {
  const root = createRoot(document.createElement("div"));
  const reconnecting = status("1", "reconnecting");
  try {
    act(() => root.render(<Probe messages={[reconnecting]} />));
    expect(toast.loading).toHaveBeenCalledTimes(1);
    const messages = [reconnecting, status("2", "reconnected"), status("3", "reconnected", false)];
    act(() => root.render(<Probe messages={messages} />));
    act(() => root.render(<Probe messages={[...messages]} />));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.loading).toHaveBeenCalledTimes(1);
    expect(interviewConnectionState(status("4", "unknown"))).toBeNull();
  } finally {
    act(() => root.unmount());
  }
  expect(toast.dismiss).toHaveBeenCalledWith("interview-provider-connection");
});
