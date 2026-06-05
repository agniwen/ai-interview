import {
  buildJobDescriptionInterviewerOptions,
  filterInterviewerIdsByDepartment,
  getDepartmentSyncedInterviewerSelection,
  getInterviewersForDepartment,
  validateJobDescriptionInterviewerDepartments,
} from "@/lib/shared/job-description-interviewers";
import { describe, expect, test } from "vitest";

const interviewers = [
  { departmentId: "dept-a", departmentName: "技术部", id: "interviewer-a", name: "技术面试官" },
  { departmentId: "dept-a", departmentName: "技术部", id: "interviewer-b", name: "架构面试官" },
  { departmentId: "dept-b", departmentName: "HR 部", id: "interviewer-c", name: "HR 面试官" },
];

describe("job-description interviewer selection", () => {
  test("filters interviewer options by selected department", () => {
    expect(getInterviewersForDepartment(interviewers, "dept-a").map((item) => item.id)).toEqual([
      "interviewer-a",
      "interviewer-b",
    ]);
  });

  test("keeps unavailable interviewer options disabled and after selectable ones", () => {
    expect(buildJobDescriptionInterviewerOptions(interviewers, "dept-b", false)).toEqual([
      {
        description: "HR 部",
        disabled: false,
        label: "HR 面试官",
        value: "interviewer-c",
      },
      {
        description: "技术部",
        disabled: true,
        label: "技术面试官",
        value: "interviewer-a",
      },
      {
        description: "技术部",
        disabled: true,
        label: "架构面试官",
        value: "interviewer-b",
      },
    ]);
  });

  test("keeps all interviewer options selectable when cross-department matching is allowed", () => {
    expect(buildJobDescriptionInterviewerOptions(interviewers, "dept-b", true)).toEqual([
      {
        description: "技术部",
        disabled: false,
        label: "技术面试官",
        value: "interviewer-a",
      },
      {
        description: "技术部",
        disabled: false,
        label: "架构面试官",
        value: "interviewer-b",
      },
      {
        description: "HR 部",
        disabled: false,
        label: "HR 面试官",
        value: "interviewer-c",
      },
    ]);
  });

  test("removes selected interviewers outside the selected department", () => {
    expect(
      filterInterviewerIdsByDepartment(interviewers, "dept-a", ["interviewer-a", "interviewer-c"]),
    ).toEqual(["interviewer-a"]);
  });

  test("syncs department to the newly selected interviewer's department", () => {
    expect(
      getDepartmentSyncedInterviewerSelection({
        allowCrossDepartmentInterviewers: false,
        currentDepartmentId: "dept-a",
        interviewers,
        nextInterviewerIds: ["interviewer-a", "interviewer-c"],
        previousInterviewerIds: ["interviewer-a"],
      }),
    ).toEqual({
      departmentId: "dept-b",
      interviewerIds: ["interviewer-c"],
    });
  });

  test("keeps department unchanged when cross-department matching is allowed", () => {
    expect(
      getDepartmentSyncedInterviewerSelection({
        allowCrossDepartmentInterviewers: true,
        currentDepartmentId: "dept-a",
        interviewers,
        nextInterviewerIds: ["interviewer-a", "interviewer-c"],
        previousInterviewerIds: ["interviewer-a"],
      }),
    ).toEqual({
      departmentId: "dept-a",
      interviewerIds: ["interviewer-a", "interviewer-c"],
    });
  });

  test("rejects cross-department interviewers unless explicitly allowed", () => {
    expect(
      validateJobDescriptionInterviewerDepartments({
        allowCrossDepartmentInterviewers: false,
        departmentId: "dept-a",
        interviewers,
      }),
    ).toEqual("面试官必须属于所选部门，或开启跨部门面试官匹配。");

    expect(
      validateJobDescriptionInterviewerDepartments({
        allowCrossDepartmentInterviewers: true,
        departmentId: "dept-a",
        interviewers,
      }),
    ).toBeNull();
  });
});
