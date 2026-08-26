import { describe, expect, it } from "vitest";
import { contentHeaderTitle, parseMeetingSessionId } from "./content-header-title";

describe("contentHeaderTitle", () => {
  it("uses sidebar menu labels on menu routes", () => {
    expect(contentHeaderTitle({ pathname: "/meetings/new" })).toBe("创建录制");
    expect(contentHeaderTitle({ pathname: "/meetings" })).toBe("录制记录");
    expect(contentHeaderTitle({ pathname: "/recruitment" })).toBe("AI Recruitment Copilot 招聘台");
    expect(contentHeaderTitle({ pathname: "/resumes/rec-1" })).toBe(
      "AI Recruitment Copilot 招聘台",
    );
    expect(contentHeaderTitle({ pathname: "/recruitment/overlay/rec-1" })).toBe(
      "AI Recruitment Copilot 招聘台",
    );
    expect(contentHeaderTitle({ pathname: "/settings/general" })).toBe("通用");
    expect(contentHeaderTitle({ pathname: "/settings/appearance" })).toBe("外观");
  });

  it("uses the session title on meeting session routes", () => {
    expect(
      contentHeaderTitle({
        pathname: "/meetings/00000000-0000-4000-8000-000000000077",
        sessionTitle: "录制记录-2608130026",
      }),
    ).toBe("录制记录");
    expect(
      contentHeaderTitle({
        pathname: "/meetings/00000000-0000-4000-8000-000000000077/more",
        sessionTitle: "手机开箱体验",
      }),
    ).toBe("手机开箱体验");
  });

  it("uses the archive menu label on archived session routes", () => {
    expect(
      contentHeaderTitle({
        pathname: "/meetings/00000000-0000-4000-8000-000000000077",
        sessionArchived: true,
        sessionTitle: "手机开箱体验",
      }),
    ).toBe("归档记录");
    expect(
      contentHeaderTitle({
        pathname: "/meetings/00000000-0000-4000-8000-000000000077/more",
        sessionArchived: true,
        sessionTitle: "手机开箱体验",
      }),
    ).toBe("归档记录");
  });

  it("does not treat the new-meeting route as a session", () => {
    expect(parseMeetingSessionId("/meetings/new")).toBeNull();
    expect(parseMeetingSessionId("/meetings/abc-1")).toBe("abc-1");
    expect(parseMeetingSessionId("/meetings/abc-1/more")).toBe("abc-1");
  });
});
