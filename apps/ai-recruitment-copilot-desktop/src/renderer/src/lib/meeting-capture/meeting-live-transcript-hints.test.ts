import { describe, expect, it } from "vitest";
import { createMeetingLiveTranscriptHints } from "./meeting-live-transcript-hints";

describe("meeting live transcript hints", () => {
  it("builds a bounded context and ordinary-weight unique hotwords from recruiting metadata", () => {
    const hints = createMeetingLiveTranscriptHints({
      candidateName: "张三",
      jobDescriptionDepartmentName: "研发部",
      jobDescriptionName: "高级前端工程师",
      resumeSkills: ["React", "TanStack", "React", "TypeScript"],
      targetRole: "Frontend Lead",
    });

    expect(hints.context).toHaveLength(1);
    expect(hints.context[0]?.length).toBeLessThanOrEqual(400);
    expect(hints.context[0]).toContain("候选人：张三");
    expect(hints.vocabulary).toEqual({
      "Frontend Lead": 4,
      React: 4,
      TanStack: 4,
      TypeScript: 4,
      张三: 4,
      研发部: 4,
      高级前端工程师: 4,
    });
  });

  it("drops empty and overlong hotwords while keeping context within provider limits", () => {
    const hints = createMeetingLiveTranscriptHints({
      candidateName: " ",
      jobDescriptionDepartmentName: null,
      jobDescriptionName: "这是一个超过十五个中文字符所以不应进入热词表的岗位名称",
      resumeSkills: Array.from({ length: 80 }, (_, index) => `skill-${index}`),
      targetRole: null,
    });

    expect(Object.keys(hints.vocabulary)).toHaveLength(30);
    expect(hints.vocabulary).not.toHaveProperty(
      "这是一个超过十五个中文字符所以不应进入热词表的岗位名称",
    );
    expect(hints.context[0]?.length).toBeLessThanOrEqual(400);
  });
});
