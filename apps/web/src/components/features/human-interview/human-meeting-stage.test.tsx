// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- The regression isolates the LiveKit stage boundary and its child panels. */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanMeetingStage } from "./human-meeting-stage";
import type { HumanMeetingViewMode } from "./human-meeting-materials-model";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@livekit/components-react", () => ({
  DisconnectButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  ParticipantTile: () => <div />,
  TrackLoop: () => null,
  TrackToggle: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  useParticipants: () => [],
  useTrackRefContext: () => ({
    participant: { identity: "interviewer-1", isLocal: true, metadata: "", name: "面试官" },
    source: "camera",
  }),
  useTracks: () => [],
}));

vi.mock("./human-meeting-audio-controls", () => ({
  MicrophoneDeviceMenu: () => null,
  VoiceEffectMenu: () => null,
}));

vi.mock("./interviewer-candidate-materials", () => ({
  InterviewerCandidateMaterials: () => null,
}));

vi.mock("./human-meeting-review", () => ({
  HumanMeetingReview: () => null,
}));

vi.mock("./human-meeting-live-transcript", () => ({
  HumanMeetingLiveTranscript: () => <div>自动实时转录窗口</div>,
}));

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
});

describe("HumanMeetingStage realtime transcript", () => {
  it("mounts the interviewer transcript automatically without an opt-in control", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    const renderStage = (viewMode: HumanMeetingViewMode) =>
      act(() =>
        root.render(
          <HumanMeetingStage
            canEndMeeting
            canPublish
            canUseLiveTranscript
            canUseVoiceEffects={false}
            candidateMaterialsState={{ candidateId: null, centerTab: "detail", leftTab: "ai" }}
            inviteToken="invite-1"
            isEnding={false}
            onCandidateMaterialsStateChange={() => {}}
            onEndMeeting={() => {}}
            onViewModeChange={() => {}}
            participantName="面试官"
            recordingStatus="active"
            title="真人复面"
            viewMode={viewMode}
          />,
        ),
      );
    renderStage("meeting");

    expect(container.textContent).toContain("自动实时转录窗口");
    expect(container.textContent).not.toContain("试试实时转录");
    expect(container.textContent).not.toContain("关闭实时转录");
    const workspace = container.querySelector('[data-slot="meeting-workspace"]');
    const mainPanels = container.querySelector('[data-slot="meeting-main-panels"]');
    expect(workspace).not.toBeNull();
    expect(mainPanels).not.toBeNull();
    const transcriptPanel = [...(workspace?.children ?? [])].find((element) =>
      element.textContent?.includes("自动实时转录窗口"),
    );
    expect(transcriptPanel).toBeDefined();
    expect(mainPanels?.contains(transcriptPanel ?? null)).toBe(false);
    for (const viewMode of ["materials", "review", "meeting"] as const) {
      renderStage(viewMode);
      expect(transcriptPanel?.parentElement).toBe(workspace);
      expect(transcriptPanel?.isConnected).toBe(true);
      expect(mainPanels?.textContent).not.toContain("自动实时转录窗口");
    }
  });
});
