import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../factory";
import { createMeetingExportsRouter } from "./route";
import type { MeetingExportsDependencies } from "./route";

const mocks = {
  prepareMeetingExport: vi.fn<MeetingExportsDependencies["prepareMeetingExport"]>(),
};

const dependencies: MeetingExportsDependencies = mocks;

function app() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: "org-83" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "member" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: "user-83" } as never);
      await next();
    })
    .route("/meetings/:id/exports", createMeetingExportsRouter(dependencies));
}

describe("Meeting export route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects audio to a short-lived object URL instead of proxying media", async () => {
    mocks.prepareMeetingExport.mockResolvedValue({
      kind: "audio",
      url: "https://recordings.example/signed-playback.webm",
    });
    const response = await app().request("/meetings/meeting-83/exports/audio", {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://recordings.example/signed-playback.webm",
    );
    expect(await response.text()).not.toContain("recording bytes");
  });

  it("returns a streaming attachment response for text formats", async () => {
    mocks.prepareMeetingExport.mockResolvedValue({
      body: new Blob(["# 会议导出\n"]).stream(),
      contentType: "text/markdown; charset=utf-8",
      filename: "meeting-83.md",
      kind: "text",
    });
    const response = await app().request("/meetings/meeting-83/exports/markdown");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(await response.text()).toBe("# 会议导出\n");
  });

  it("rejects unsupported formats before calling the service", async () => {
    const response = await app().request("/meetings/meeting-83/exports/provider-json");
    expect(response.status).toBe(400);
    expect(mocks.prepareMeetingExport).not.toHaveBeenCalled();
  });

  it("rejects an unknown source track before calling the service", async () => {
    const response = await app().request(
      "/meetings/meeting-83/exports/audio?track=provider-internal",
    );
    expect(response.status).toBe(400);
    expect(mocks.prepareMeetingExport).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", 404],
    ["forbidden", 403],
    ["not-ready", 409],
  ] as const)("maps %s without exposing internal details", async (kind, status) => {
    mocks.prepareMeetingExport.mockResolvedValue({ kind });
    const response = await app().request("/meetings/meeting-83/exports/json");
    expect(response.status).toBe(status);
    expect(await response.text()).not.toMatch(/storage|provider|model/i);
  });
});
