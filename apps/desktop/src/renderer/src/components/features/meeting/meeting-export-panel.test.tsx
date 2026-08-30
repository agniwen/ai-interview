import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingExportPanel, canExportMeeting } from "./meeting-export-panel";

describe("Meeting export panel", () => {
  it("keeps Viewer and Editor read-only while Owner and administrator may export", () => {
    expect(canExportMeeting("viewer")).toBe(false);
    expect(canExportMeeting("editor")).toBe(false);
    expect(canExportMeeting("owner")).toBe(true);
    expect(canExportMeeting("administrator")).toBe(true);
  });

  it("offers audio, Markdown, TXT, SRT and JSON as direct authenticated downloads", () => {
    const html = renderToStaticMarkup(
      <MeetingExportPanel accessRole="owner" meetingId="meeting 83" slug="workspace demo" />,
    );
    expect(html).toContain("导出会议资产");
    for (const format of ["audio", "markdown", "txt", "srt", "json"]) {
      expect(html).toContain(`/api/w/workspace%20demo/meetings/meeting%2083/exports/${format}`);
    }
  });

  it("renders nothing for a non-exporting role", () => {
    expect(
      renderToStaticMarkup(
        <MeetingExportPanel accessRole="editor" meetingId="meeting-83" slug="workspace" />,
      ),
    ).toBe("");
  });
});
