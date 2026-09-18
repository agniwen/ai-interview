// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- The regression isolates the LiveKit stage boundary and its child panels. */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HumanMeetingStage } from "./human-meeting-stage";
import type { HumanMeetingViewMode } from "./human-meeting-materials-model";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mediaState = vi.hoisted(() => ({ agent: false, sharing: false, source: "camera" }));

vi.mock("@livekit/components-react", () => ({
  ConnectionQualityIndicator: () => <span aria-label="连接质量" />,
  DisconnectButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  FocusLayoutContainer: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  ParticipantName: ({ participant }: { participant: { name: string } }) => (
    <span>{participant.name}</span>
  ),
  ParticipantTile: ({ className }: { className: string }) => (
    <div data-testid="participant-tile" className={className} />
  ),
  StartAudio: ({ label }: { label: string }) => <button>{label}</button>,
  TrackLoop: ({
    children,
    tracks,
  }: {
    children: React.ReactNode;
    tracks: { source: string; participant: { identity: string } }[];
  }) => (
    <div
      data-track-sources={tracks.map((track) => track.source).join(",")}
      data-track-identities={tracks.map((track) => track.participant.identity).join(",")}
    >
      {children}
    </div>
  ),
  TrackMutedIndicator: () => <span aria-label="已静音" />,
  TrackToggle: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  useParticipants: () =>
    mediaState.agent ? [{ isAgent: false }, { isAgent: false }, { isAgent: true }] : [],
  useTrackRefContext: () => ({
    participant: { identity: "interviewer", isLocal: true, metadata: "", name: "面试官" },
    source: mediaState.source,
  }),
  useTracks: () => [
    ...(mediaState.agent
      ? [
          { participant: { identity: "collector", isAgent: true }, source: "camera" },
          { participant: { identity: "collector", isAgent: true }, source: "screen_share" },
        ]
      : []),
    ...(mediaState.sharing
      ? [
          { participant: { identity: "candidate", isLocal: false }, source: "screen_share" },
          { participant: { identity: "candidate", isLocal: false }, source: "camera" },
          { participant: { identity: "interviewer", isLocal: true }, source: "camera" },
        ]
      : []),
  ],
}));

vi.mock("./human-meeting-audio-controls", () => ({
  MicrophoneDeviceMenu: () => null,
  VoiceEffectMenu: () => null,
}));

vi.mock("./interviewer-candidate-materials", () => ({
  InterviewerCandidateMaterials: ({
    transcriptPanelRef,
  }: {
    transcriptPanelRef?: React.Ref<HTMLDivElement>;
  }) => <div ref={transcriptPanelRef} data-testid="transcript-tab" />,
}));

vi.mock("./human-meeting-live-transcript", () => ({
  HumanMeetingLiveTranscript: ({
    renderPanel,
  }: {
    renderPanel?: (panel: React.ReactNode) => React.ReactNode;
  }) => {
    const panel = <div>自动实时转录窗口</div>;
    return renderPanel ? renderPanel(panel) : panel;
  },
}));

const roots: ReturnType<typeof createRoot>[] = [];

function expectTranscriptLocation(
  workspace: Element | null,
  mainPanels: Element | null,
  inTab: boolean,
  viewMode: HumanMeetingViewMode,
) {
  if (viewMode === "meeting") {
    expect(workspace?.textContent).not.toContain("自动实时转录窗口");
    expect(workspace?.children).toHaveLength(1);
  } else if (inTab) {
    expect(mainPanels?.querySelector('[data-testid="transcript-tab"]')?.textContent).toContain(
      "自动实时转录窗口",
    );
    expect(workspace?.children).toHaveLength(1);
  } else {
    expect(workspace?.lastElementChild?.textContent).toBe("自动实时转录窗口");
    expect(mainPanels?.textContent).not.toContain("自动实时转录窗口");
  }
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  mediaState.source = "camera";
  mediaState.sharing = false;
  mediaState.agent = false;
});

describe("HumanMeetingStage realtime transcript", () => {
  it("excludes the background agent from participant count, tiles and focused tracks", () => {
    mediaState.agent = true;
    mediaState.sharing = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
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
          title="真人复面"
          viewMode="meeting"
        />,
      ),
    );
    expect(container.querySelector('[aria-label="参会人数"]')?.textContent).toBe("2");
    const displayedIdentities = [
      ...container.querySelectorAll<HTMLElement>("[data-track-identities]"),
    ]
      .map((element) => element.dataset.trackIdentities)
      .join(",");
    expect(displayedIdentities).not.toContain("collector");
    expect(displayedIdentities).toContain("candidate");
    expect(displayedIdentities).toContain("interviewer");
    expect(
      container.querySelector<HTMLElement>(
        '[data-slot="meeting-share-main"] [data-track-identities]',
      )?.dataset.trackIdentities,
    ).toBe("candidate");
  });
  it.each([437, 1024])(
    "preserves the stage and shows responsive end confirmation at width %s",
    (width) => {
      vi.stubGlobal("innerWidth", width);
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);

      const renderStage = (viewMode: HumanMeetingViewMode, canEndMeeting = true) =>
        act(() =>
          root.render(
            <HumanMeetingStage
              canEndMeeting={canEndMeeting}
              canPublish
              canUseLiveTranscript
              canUseVoiceEffects={false}
              candidateMaterialsState={{ candidateId: null, centerTab: "detail", leftTab: "ai" }}
              inviteToken="invite-1"
              isEnding={false}
              onCandidateMaterialsStateChange={() => {}}
              onEndMeeting={() => {}}
              onViewModeChange={() => {}}
              title="真人复面"
              viewMode={viewMode}
            />,
          ),
        );
      renderStage("meeting");
      act(() =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === "结束会议")
          ?.click(),
      );
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("结束这场会议？");
      expect(Boolean(document.querySelector("[data-vaul-drawer]"))).toBe(width < 768);
      act(() =>
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent === "取消")
          ?.click(),
      );

      expect(container.textContent).not.toContain("面试评价");
      expect(container.textContent).toContain("切换到信息");
      expect(container.textContent).toContain("结束会议");
      expect(container.textContent).not.toContain("离开");
      expect(container.textContent).toContain("开启声音");
      const details = container.querySelector('[data-slot="participant-details"]');
      expect(details?.textContent).toBe("面试官面试官");
      expect(details?.className).toContain("z-20");
      expect(details?.querySelector('[aria-label="已静音"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="participant-tile"]')?.className).toContain(
        "[&_video]:object-cover",
      );
      mediaState.source = "screen_share";
      renderStage("meeting");
      expect(container.querySelector('[data-testid="participant-tile"]')?.className).toContain(
        "[&_video]:object-contain",
      );
      expect(container.querySelector('[data-testid="participant-tile"]')?.className).not.toContain(
        "[&_video]:object-cover",
      );

      expect(container.textContent).not.toContain("自动实时转录窗口");
      expect(container.textContent).not.toContain("试试实时转录");
      expect(container.textContent).not.toContain("关闭实时转录");
      const workspace = container.querySelector('[data-slot="meeting-workspace"]');
      const mainPanels = container.querySelector('[data-slot="meeting-main-panels"]');
      expect(workspace).not.toBeNull();
      expect(mainPanels).not.toBeNull();
      for (const viewMode of ["materials", "meeting"] as const) {
        renderStage(viewMode);
        expectTranscriptLocation(workspace, mainPanels, width < 768, viewMode);
        expect(container.textContent).toContain(
          viewMode === "materials" ? "切换到视频" : "切换到信息",
        );
        expect(container.textContent).not.toContain("切换视图");
      }
      renderStage("meeting", false);
      expect(container.textContent).toContain("离开");
      expect(container.textContent).not.toContain("结束会议");
      mediaState.sharing = true;
      mediaState.source = "camera";
      renderStage("meeting");
      expect(container.querySelector('[data-slot="meeting-grid-layout"]')).toBeNull();
      expect(
        container.querySelector<HTMLElement>(
          '[data-slot="meeting-share-main"] [data-track-sources]',
        )?.dataset.trackSources,
      ).toBe("screen_share");
      expect(
        container.querySelector<HTMLElement>(
          '[data-slot="meeting-share-sidebar"] [data-track-sources]',
        )?.dataset.trackSources,
      ).toBe("camera,camera");
      const thumbnail = container.querySelector<HTMLButtonElement>(
        '[data-slot="meeting-share-sidebar"] button[title="设为主画面"]',
      );
      expect(thumbnail).not.toBeNull();
      act(() => thumbnail?.click());
      expect(
        container.querySelector<HTMLElement>(
          '[data-slot="meeting-share-main"] [data-track-sources]',
        )?.dataset.trackSources,
      ).toBe("camera");
      const resetFocus = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "自动布局",
      );
      expect(resetFocus).toBeDefined();
      act(() => resetFocus?.click());
      expect(
        container.querySelector<HTMLElement>(
          '[data-slot="meeting-share-main"] [data-track-sources]',
        )?.dataset.trackSources,
      ).toBe("screen_share");
      act(() =>
        container
          .querySelector<HTMLButtonElement>(
            '[data-slot="meeting-share-sidebar"] button[title="设为主画面"]',
          )
          ?.click(),
      );
      mediaState.sharing = false;
      renderStage("meeting");
      expect(container.textContent).not.toContain("自动布局");
      expect(container.querySelector('[data-slot="meeting-share-layout"]')).toBeNull();
      expect(container.querySelector('[data-slot="meeting-grid-layout"]')).not.toBeNull();
    },
  );
});
