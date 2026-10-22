// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Speaking state comes from the LiveKit room boundary. */

import type { Participant } from "livekit-client";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MeetingParticipantRoster } from "./meeting-participant-roster";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const speaking = vi.hoisted(() => new Set<string>());

vi.mock("@livekit/components-react", () => ({
  useIsSpeaking: ({ identity }: { identity: string }) => speaking.has(identity),
}));

function makeParticipant(fields: Partial<Participant>): Participant {
  // SAFETY: the roster only reads identity, name, isLocal and metadata.
  return { isLocal: false, metadata: "", ...fields } as Participant;
}

let container: HTMLDivElement;

afterEach(() => {
  container?.remove();
  speaking.clear();
});

it("lists the candidate first with role marks and flags who is speaking", () => {
  speaking.add("interviewer_1");
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <MeetingParticipantRoster
        participants={[
          makeParticipant({
            identity: "interviewer_1",
            isLocal: true,
            metadata: JSON.stringify({ participant_role: "host", participant_type: "interviewer" }),
            name: "艾伦",
          }),
          makeParticipant({ identity: "candidate_1", name: "陈绮浈" }),
        ]}
      />,
    ),
  );

  const items = [...container.querySelectorAll("li")];
  expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
    "陈绮浈 · 候选人",
    "艾伦（我） · 主持人 · 正在说话",
  ]);
  expect(items.map((item) => item.dataset.speaking)).toEqual(["false", "true"]);
  act(() => root.unmount());
});
