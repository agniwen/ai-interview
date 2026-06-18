import { describe, expect, it } from "vitest";
import {
  formatResumeEducationItem,
  formatResumeEducationItems,
  formatResumeEducationLine,
  formatResumeEducationLines,
} from "./resume-education";

describe("formatResumeEducationLine", () => {
  it("formats education level before school and major after a centered dot", () => {
    expect(
      formatResumeEducationItem({
        degree: "学士",
        educationLevel: "本科",
        major: "计算机科学与技术",
        school: "清华大学",
      }),
    ).toEqual({
      level: "本科",
      major: "计算机科学与技术",
      school: "清华大学",
    });
    expect(
      formatResumeEducationLine({
        degree: "学士",
        educationLevel: "本科",
        major: "计算机科学与技术",
        school: "清华大学",
      }),
    ).toBe("本科 清华大学 · 计算机科学与技术");
  });

  it("falls back to degree when education level is missing", () => {
    expect(
      formatResumeEducationLine({
        degree: "硕士",
        educationLevel: null,
        major: "软件工程",
        school: "浙江大学",
      }),
    ).toBe("硕士 浙江大学 · 软件工程");
  });

  it("returns null when school is missing", () => {
    expect(
      formatResumeEducationLine({
        degree: "学士",
        educationLevel: "本科",
        major: "计算机科学与技术",
        school: null,
      }),
    ).toBeNull();
  });

  it("sorts display items and lines by education level from master to bachelor to junior college", () => {
    const educationExperiences = [
      {
        degree: null,
        educationLevel: "本科",
        major: "计算机科学与技术",
        school: "本科大学",
      },
      {
        degree: null,
        educationLevel: "大专",
        major: "软件技术",
        school: "大专学院",
      },
      {
        degree: "硕士",
        educationLevel: null,
        major: "软件工程",
        school: "硕士大学",
      },
    ];

    expect(formatResumeEducationItems(educationExperiences).map((item) => item.level)).toEqual([
      "硕士",
      "本科",
      "大专",
    ]);
    expect(formatResumeEducationLines(educationExperiences)).toEqual([
      "硕士 硕士大学 · 软件工程",
      "本科 本科大学 · 计算机科学与技术",
      "大专 大专学院 · 软件技术",
    ]);
  });
});
