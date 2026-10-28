import { describe, expect, it } from "vitest";
import { describeToolCall } from "../tool-chip-descriptors";

describe("describeToolCall", () => {
  it("surfaces rejection reasons for a patch that failed validation", () => {
    const description = describeToolCall({
      args: {},
      result: { issues: ["面试官 小算 不属于所属部门。"], kind: "patch_rejected" },
      toolName: "propose_job_description_patch",
    });

    expect(description).toMatchObject({
      detail: ["面试官 小算 不属于所属部门。"],
      tone: "warning",
    });
  });

  it("lists the fields a job patch changes", () => {
    const description = describeToolCall({
      args: {},
      result: {
        baseFingerprints: {},
        changes: { departmentId: "dept-ai", headcount: 3 },
        kind: "job_description_patch",
        summary: "调整部门和人数",
      },
      toolName: "propose_job_description_patch",
    });

    expect(description.summary).toBe("所属部门、招聘人数");
  });

  it("falls back to the tool name for unregistered tools", () => {
    expect(
      describeToolCall({ args: {}, result: undefined, toolName: "mystery_tool" }),
    ).toMatchObject({ label: "调用工具", summary: "mystery_tool" });
  });
});
