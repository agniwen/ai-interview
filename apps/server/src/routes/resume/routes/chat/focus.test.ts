import { describe, expect, it, vi } from "vitest";
import { resolveRecruitingCopilotFocus } from "./focus";

describe("resolveRecruitingCopilotFocus", () => {
  it("does not load a record for workspace-wide chat", async () => {
    const loadResumeRecord = vi.fn();

    await expect(
      resolveRecruitingCopilotFocus(
        { focus: undefined, organizationId: "org-1", visibilityScope: { kind: "all" } },
        { loadResumeRecord },
      ),
    ).resolves.toBeNull();
    expect(loadResumeRecord).not.toHaveBeenCalled();
  });

  it("resolves a focused record inside the current workspace", async () => {
    const loadResumeRecord = vi.fn().mockResolvedValue({ id: "resume-1" });

    await expect(
      resolveRecruitingCopilotFocus(
        {
          focus: { id: "resume-1", kind: "resume_record" },
          organizationId: "org-1",
          visibilityScope: { kind: "restricted", userIds: ["user-1"] },
        },
        { loadResumeRecord },
      ),
    ).resolves.toEqual({ id: "resume-1", kind: "resume_record" });
    expect(loadResumeRecord).toHaveBeenCalledWith({
      organizationId: "org-1",
      resumeRecordId: "resume-1",
      visibilityScope: { kind: "restricted", userIds: ["user-1"] },
    });
  });

  it("returns not_found when the record is outside the workspace", async () => {
    const loadResumeRecord = vi.fn().mockResolvedValue(null);

    await expect(
      resolveRecruitingCopilotFocus(
        {
          focus: { id: "resume-other", kind: "resume_record" },
          organizationId: "org-1",
          visibilityScope: { kind: "restricted", userIds: ["user-1"] },
        },
        { loadResumeRecord },
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });
});
