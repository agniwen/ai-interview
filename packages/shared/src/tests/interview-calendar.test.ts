import { describe, expect, it } from "vitest";
import { buildInterviewCalendarTitle, interviewCalendarJobNames } from "../interview-calendar";

describe("interview calendar job names", () => {
  it("shows one candidate to candidates and all candidates to the grouped meeting interviewer", () => {
    const candidates = [
      { candidateName: "张三", jobDescriptionName: "前端工程师", roundLabel: "业务一面" },
      { candidateName: "李四", jobDescriptionName: "后端工程师", roundLabel: "业务二面" },
    ];
    expect(buildInterviewCalendarTitle(candidates.slice(0, 1))).toBe("张三-前端工程师-业务一面");
    expect(buildInterviewCalendarTitle(candidates)).toBe(
      "张三、李四-前端工程师、后端工程师-业务一面、业务二面",
    );
  });
  it("formats the title as candidate-job-round including CEO interviews", () => {
    expect(
      buildInterviewCalendarTitle([
        { candidateName: "张三", jobDescriptionName: "前端技术经理", roundLabel: "CEO面试" },
      ]),
    ).toBe("张三-前端技术经理-CEO面试");
  });

  it("deduplicates jobs in grouped interviews and omits missing names", () => {
    const candidates = [
      { jobDescriptionName: " 前端工程师 " },
      { jobDescriptionName: "前端工程师" },
      { jobDescriptionName: null },
      { jobDescriptionName: " " },
      { jobDescriptionName: "后端工程师" },
    ];
    expect(interviewCalendarJobNames(candidates)).toBe("前端工程师、后端工程师");
    expect(
      buildInterviewCalendarTitle(
        candidates.map((candidate) => ({
          ...candidate,
          candidateName: "张三",
          roundLabel: "业务一面",
        })),
      ),
    ).toBe("张三-前端工程师、后端工程师-业务一面");
    expect(
      buildInterviewCalendarTitle([
        { candidateName: "李四", jobDescriptionName: null, roundLabel: "业务一面" },
      ]),
    ).toBe("李四-未关联岗位-业务一面");
  });
});
