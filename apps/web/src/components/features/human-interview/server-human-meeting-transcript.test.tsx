// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Supplies RTC event delivery without opening a microphone or a network room. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RoomEvent } from "livekit-client";
import { HUMAN_TRANSCRIPTION_PREVIEW_TOPIC } from "@app/shared/human-transcription";
import type { HumanTranscriptionPreview } from "@app/shared/human-transcription";
import { ServerHumanMeetingTranscript } from "./server-human-meeting-transcript";

// SAFETY: React's test-only act flag belongs to this test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rtc = vi.hoisted(() => ({ off: vi.fn(), on: vi.fn() }));
vi.mock("@livekit/components-react", () => ({ useRoomContext: () => rtc }));
class SubtitleStream extends EventTarget {
  static current: SubtitleStream;
  close = vi.fn();
  constructor() {
    super();
    SubtitleStream.current = this;
  }
}
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});
it("renders incremental RTC text, replaces it once with persisted final, and retains history after reconnect", async () => {
  const scope = {
    executionId: "00000000-0000-4000-8000-000000000001",
    generation: 1,
    runId: "run",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          ...scope,
          participants: { candidate: { displayName: "张三", role: "candidate" } },
        }),
      ),
    ),
  );
  vi.stubGlobal("EventSource", SubtitleStream);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ServerHumanMeetingTranscript inviteToken="test-invite" />);
    await Promise.resolve();
  });
  const packet: HumanTranscriptionPreview = {
    ...scope,
    event: {
      endMs: 20,
      eventId: "preview",
      itemId: "1",
      kind: "interim",
      participantIdentity: "candidate",
      providerTaskId: "task",
      revision: 0,
      startMs: 10,
      streamEpoch: "epoch",
      text: "我负责",
      trackId: "track",
    },
    sequence: 1,
  };
  const receive = rtc.on.mock.calls.findLast(([name]) => name === RoomEvent.DataReceived)?.[1];
  act(() =>
    receive(
      new TextEncoder().encode(JSON.stringify(packet)),
      { isAgent: true },
      undefined,
      HUMAN_TRANSCRIPTION_PREVIEW_TOPIC,
    ),
  );
  expect(container.textContent).toContain("正在识别");
  expect(container.textContent).toContain("我负责");
  const final = {
    ...packet,
    event: { ...packet.event, eventId: "final", kind: "final" as const, text: "我负责开发。" },
    sequence: 2,
  };
  act(() =>
    receive(
      new TextEncoder().encode(JSON.stringify(final)),
      { isAgent: true },
      undefined,
      HUMAN_TRANSCRIPTION_PREVIEW_TOPIC,
    ),
  );
  expect(container.textContent).not.toContain("正在识别");
  expect(container.textContent).toContain("正在保存");
  const update = { ...scope, error: null, events: [final.event], status: "capturing" };
  act(() =>
    SubtitleStream.current.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(update) }),
    ),
  );
  expect(container.textContent).not.toContain("正在保存");
  expect(container.querySelectorAll("p.text-sm")).toHaveLength(1);
  const reconnect = rtc.on.mock.calls.findLast(([name]) => name === RoomEvent.Reconnecting)?.[1];
  act(() => reconnect());
  act(() =>
    SubtitleStream.current.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(update) }),
    ),
  );
  expect(container.querySelectorAll("p.text-sm")).toHaveLength(1);
  expect(container.textContent).toContain("我负责开发。");
});
