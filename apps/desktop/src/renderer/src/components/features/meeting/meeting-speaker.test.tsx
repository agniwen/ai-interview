import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createMeetingSpeakerProfiles,
  MeetingSpeakerLabel,
  UNKNOWN_MEETING_SPEAKER,
} from "./meeting-speaker";

describe("meeting speaker presentation", () => {
  it("keeps numbered identities stable across pause recovery and app restart", () => {
    const initialTurns = [
      { speakerKey: "local" },
      { speakerKey: "remote-1" },
      { speakerKey: "local" },
    ];
    const initial = createMeetingSpeakerProfiles(initialTurns, "meeting-42");
    const resumed = createMeetingSpeakerProfiles(
      [...initialTurns, { speakerKey: "remote-1" }, { speakerKey: "remote-2" }],
      "meeting-42",
    );
    const reopened = createMeetingSpeakerProfiles(
      [...initialTurns, { speakerKey: "remote-1" }, { speakerKey: "remote-2" }],
      "meeting-42",
    );

    expect(initial.get("local")).toEqual({
      avatarId: "meeting-42:local",
      label: "说话人1",
    });
    expect(initial.get("remote-1")).toEqual({
      avatarId: "meeting-42:remote-1",
      label: "说话人2",
    });
    expect(resumed.get("local")).toEqual(initial.get("local"));
    expect(resumed.get("remote-1")).toEqual(initial.get("remote-1"));
    expect(resumed.get("remote-2")?.label).toBe("说话人3");
    expect([...reopened]).toEqual([...resumed]);
  });

  it("renders the unknown speaker with the fixed animated alain00 blobatar without a background", () => {
    const html = renderToStaticMarkup(<MeetingSpeakerLabel profile={UNKNOWN_MEETING_SPEAKER} />);

    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="mo-root"');
    expect(html).toContain("M82.41 51.21C82.41 71.76");
    expect(html).toMatch(/<svg[^>]*><g class="mo-root">/);
    expect(html).toContain("未知说话人");
  });

  it("keeps identified speakers on their stable generated avatar", () => {
    const html = renderToStaticMarkup(
      <MeetingSpeakerLabel profile={{ avatarId: "meeting-42:local", label: "说话人1" }} />,
    );

    expect(html).toContain("<img");
    expect(html).toContain('alt=""');
    expect(html).toContain('data-meeting-speaker-avatar="true"');
    const encodedAvatar = html.match(/src="data:image\/svg\+xml,([^"]+)"/)?.[1];
    expect(encodedAvatar).toBeDefined();
    const avatarSvg = decodeURIComponent(encodedAvatar?.replaceAll("&#x27;", "'") ?? "");
    expect(avatarSvg).toMatch(/^<svg [^>]+><g /);
  });
});
