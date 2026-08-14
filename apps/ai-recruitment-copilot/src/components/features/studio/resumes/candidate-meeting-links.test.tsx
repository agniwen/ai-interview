import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import { CandidateMeetingLinksView } from "./candidate-meeting-links";

const meeting: MeetingLibraryItem = {
  accessRole: "viewer",
  creator: { id: "owner-79", image: null, name: "Meeting Owner" },
  durationMs: 62_000,
  id: "meeting-79",
  processingState: "ready",
  recordingAvailable: true,
  savedAt: "2026-08-09T10:30:00.000Z",
  title: "候选人沟通会",
  workspaceCustodied: false,
};

describe("Candidate Recruiting Record Meeting Sessions", () => {
  it("shows only the accessible linked Meeting Sessions returned by the API", () => {
    const html = renderToStaticMarkup(<CandidateMeetingLinksView meetings={[meeting]} />);

    expect(html).toContain("关联会议");
    expect(html).toContain("候选人沟通会");
    expect(html).toContain("Meeting Owner");
    expect(html).toContain("01:02");
  });

  it("renders an explicit empty state without inventing a recruiting meeting", () => {
    const html = renderToStaticMarkup(<CandidateMeetingLinksView meetings={[]} />);
    expect(html).toContain("暂无有权限访问的关联 Meeting Session");
  });
});
