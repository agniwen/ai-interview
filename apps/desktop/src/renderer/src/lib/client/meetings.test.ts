import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRecordingTitle } from "./meetings";

describe("requestRecordingTitle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the deployed generic AI title endpoint when the meeting route is absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "Not Found" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ title: "新手机外观与配件体验" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRecordingTitle("workspace", "新手机外观、配件和扬声器体验讨论", {
        apiUrl: (path) => path,
      }),
    ).resolves.toBe("新手机外观与配件体验");

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/resume/title",
      expect.objectContaining({
        body: JSON.stringify({ hasFiles: false, text: "新手机外观、配件和扬声器体验讨论" }),
        method: "POST",
      }),
    );
  });
});
