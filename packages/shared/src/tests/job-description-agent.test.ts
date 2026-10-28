import { describe, expect, it } from "vitest";
import {
  applyJobDescriptionAgentChanges,
  buildJobDescriptionAgentPatch,
  findJobDescriptionAgentPatchConflicts,
  jobDescriptionAgentPatchMatches,
  jobDescriptionAgentPatchInputSchema,
  resolveJobDescriptionAgentReferences,
} from "../job-description-agent";
import type {
  JobDescriptionAgentOptions,
  JobDescriptionAgentPageContext,
} from "../job-description-agent";

const baseContext: JobDescriptionAgentPageContext = {
  allowCrossDepartmentInterviewers: false,
  departmentId: "dept-web",
  headcount: 2,
  internalCriteria: null,
  interviewerIds: ["iv-web"],
  jobWeight: null,
  name: "React 前端开发",
  priority: "medium",
  prompt: "负责 Web 前端开发。",
  publishedDate: null,
  referralChannels: null,
  reportingManagerUserId: null,
  salaryMaxK: "30",
  salaryMinK: "20",
  targetDate: null,
};

const options: JobDescriptionAgentOptions = {
  departments: [
    { id: "dept-web", name: "前端组" },
    { id: "dept-ai", name: "算法组" },
  ],
  interviewers: [
    { departmentId: "dept-web", id: "iv-web", name: "小前" },
    { departmentId: "dept-ai", id: "iv-ai", name: "小算" },
  ],
  members: [{ id: "user-1", name: "艾伦" }],
};

describe("job description agent patch", () => {
  it("requires at least one changed field", () => {
    expect(
      jobDescriptionAgentPatchInputSchema.safeParse({ changes: {}, summary: "无修改" }).success,
    ).toBe(false);
  });

  it("rejects fields outside the patchable set", () => {
    expect(
      jobDescriptionAgentPatchInputSchema.safeParse({
        changes: { code: "ABC1234" },
        summary: "设置编码",
      }).success,
    ).toBe(false);
  });

  it("reports no conflict while the patched fields are unchanged", () => {
    const patch = buildJobDescriptionAgentPatch(
      { changes: { prompt: "负责 React 组件开发。" }, summary: "细化职责" },
      baseContext,
    );

    expect(
      findJobDescriptionAgentPatchConflicts(patch, { ...baseContext, name: "高级前端开发" }),
    ).toEqual([]);
  });

  it("reports patched fields that changed after the patch was generated", () => {
    const patch = buildJobDescriptionAgentPatch(
      { changes: { headcount: 3, prompt: "负责 React 组件开发。" }, summary: "细化职责" },
      baseContext,
    );

    expect(
      findJobDescriptionAgentPatchConflicts(patch, { ...baseContext, prompt: "已被同事修改。" }),
    ).toEqual(["prompt"]);
  });

  it("treats blank strings and null as the same base value", () => {
    const patch = buildJobDescriptionAgentPatch(
      { changes: { internalCriteria: "优先有组件库经验" }, summary: "补充内部标准" },
      baseContext,
    );

    expect(
      findJobDescriptionAgentPatchConflicts(patch, { ...baseContext, internalCriteria: "  " }),
    ).toEqual([]);
  });

  it("returns the values to write and the previous values for undo", () => {
    expect(
      applyJobDescriptionAgentChanges({ headcount: 3, salaryMaxK: null }, baseContext),
    ).toEqual({
      next: { headcount: 3, salaryMaxK: null },
      previous: { headcount: 2, salaryMaxK: "30" },
    });
  });
});

describe("job description agent references", () => {
  it("resolves reference ids to display names", () => {
    expect(
      resolveJobDescriptionAgentReferences(
        { interviewerIds: ["iv-web"], reportingManagerUserId: "user-1" },
        baseContext,
        options,
      ),
    ).toEqual({
      displayValues: { interviewerIds: "小前", reportingManagerUserId: "艾伦" },
      issues: [],
    });
  });

  it("rejects ids that are not workspace options", () => {
    const { issues } = resolveJobDescriptionAgentReferences(
      { departmentId: "dept-missing" },
      baseContext,
      options,
    );

    expect(issues).toHaveLength(1);
  });

  it("rejects interviewers outside the department unless cross-department matching is on", () => {
    const moved = { departmentId: "dept-ai" };

    expect(resolveJobDescriptionAgentReferences(moved, baseContext, options).issues).toHaveLength(
      1,
    );
    expect(
      resolveJobDescriptionAgentReferences(
        { ...moved, interviewerIds: ["iv-ai"] },
        baseContext,
        options,
      ).issues,
    ).toEqual([]);
    expect(
      resolveJobDescriptionAgentReferences(
        { ...moved, allowCrossDepartmentInterviewers: true },
        baseContext,
        options,
      ).issues,
    ).toEqual([]);
  });

  it("checks the salary range against the unchanged bound", () => {
    expect(
      resolveJobDescriptionAgentReferences({ salaryMinK: "40" }, baseContext, options).issues,
    ).toHaveLength(1);
  });
});

describe("job description agent patch matching", () => {
  it("matches once the form holds the patched values", () => {
    const patch = buildJobDescriptionAgentPatch(
      { changes: { headcount: 3, interviewerIds: ["iv-web"] }, summary: "加人" },
      baseContext,
    );

    expect(jobDescriptionAgentPatchMatches(patch, baseContext)).toBe(false);
    expect(jobDescriptionAgentPatchMatches(patch, { ...baseContext, headcount: 3 })).toBe(true);
  });
});
