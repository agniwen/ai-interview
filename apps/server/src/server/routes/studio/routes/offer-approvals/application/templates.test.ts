import { describe, expect, it } from "vitest";
import { assertTemplateApproverSelection, chooseDefaultTemplateId } from "./templates";

const enabledTemplate = (id: string, isDefault = false) => ({ enabled: true, id, isDefault });

describe("Offer 审批模板提交约束", () => {
  it("accepts the server-resolved ordered approvers", () => {
    expect(() =>
      assertTemplateApproverSelection({
        resolvedApproverIds: ["manager", "finance"],
        submittedApproverIds: ["manager", "finance"],
      }),
    ).not.toThrow();
  });

  it("rejects a normal submitter who changes a template approver", () => {
    expect(() =>
      assertTemplateApproverSelection({
        resolvedApproverIds: ["manager", "finance"],
        submittedApproverIds: ["manager", "other"],
      }),
    ).toThrow("审批人已变化");
  });

  it("accepts repeated people when they are separate template nodes", () => {
    expect(() =>
      assertTemplateApproverSelection({
        resolvedApproverIds: ["manager", "manager"],
        submittedApproverIds: ["manager", "manager"],
      }),
    ).not.toThrow();
  });
});

describe("Offer 审批默认模板", () => {
  it("keeps the current default when another template is enabled", () => {
    expect(
      chooseDefaultTemplateId([enabledTemplate("current", true), enabledTemplate("new")], "new"),
    ).toBe("current");
  });

  it("uses the newly enabled template when no default exists", () => {
    expect(chooseDefaultTemplateId([enabledTemplate("older"), enabledTemplate("new")], "new")).toBe(
      "new",
    );
  });

  it("falls back to another enabled template after the default is disabled or deleted", () => {
    expect(
      chooseDefaultTemplateId([
        { enabled: false, id: "old-default", isDefault: false },
        enabledTemplate("fallback"),
      ]),
    ).toBe("fallback");
  });

  it("allows no default only when no template is enabled", () => {
    expect(
      chooseDefaultTemplateId([{ enabled: false, id: "disabled", isDefault: false }]),
    ).toBeNull();
  });
});
