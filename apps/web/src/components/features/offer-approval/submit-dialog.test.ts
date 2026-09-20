import { describe, expect, it } from "vitest";
import { chooseApprovalTemplate } from "./submit-dialog";

const templates = [
  { id: "other", isDefault: false, name: "其他模板" },
  { id: "default", isDefault: true, name: "默认模板" },
];

describe("Offer 审批模板选择", () => {
  it("loads the default template first", () => {
    expect(chooseApprovalTemplate(templates, null)?.id).toBe("default");
  });

  it("keeps a user's explicit template switch", () => {
    expect(chooseApprovalTemplate(templates, "other")?.id).toBe("other");
  });

  it("falls back to the default when the selected template is no longer available", () => {
    expect(chooseApprovalTemplate(templates, "removed")?.id).toBe("default");
  });
});
