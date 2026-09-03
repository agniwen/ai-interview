import { describe, expect, it } from "vitest";
import {
  formatResumeEducationItem,
  formatResumeEducationItems,
  formatResumeEducationLine,
  formatResumeEducationLines,
  formatResumeEducationSchoolWithLevel,
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

  it("formats the recorded education level after the school for resume cards", () => {
    expect(
      formatResumeEducationSchoolWithLevel({
        educationLevel: "本科",
        school: "清华大学",
      }),
    ).toBe("清华大学（本科）");
    expect(
      formatResumeEducationSchoolWithLevel({
        educationLevel: "专科",
        school: "职业技术学院",
      }),
    ).toBe("职业技术学院（大专）");
    expect(
      formatResumeEducationSchoolWithLevel({
        educationLevel: "博士研究生",
        school: "北京大学",
      }),
    ).toBe("北京大学（博士）");
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

  it("sorts display items and lines from doctorate to master to bachelor to junior college", () => {
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
      {
        degree: "博士",
        educationLevel: "博士研究生",
        major: "人工智能",
        school: "博士大学",
      },
    ];

    expect(formatResumeEducationItems(educationExperiences).map((item) => item.level)).toEqual([
      "博士研究生",
      "硕士",
      "本科",
      "大专",
    ]);
    expect(formatResumeEducationLines(educationExperiences)).toEqual([
      "博士研究生 博士大学 · 人工智能",
      "硕士 硕士大学 · 软件工程",
      "本科 本科大学 · 计算机科学与技术",
      "大专 大专学院 · 软件技术",
    ]);
  });
});
