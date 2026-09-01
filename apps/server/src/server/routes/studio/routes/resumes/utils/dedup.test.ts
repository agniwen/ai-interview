import { describe, expect, it, vi } from "vitest";
import type { DedupMatchRecord } from "../../interviews/dao/studio-interviews";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { resolveResumeCreateDedupConflict } from "./dedup";

const PROFILE: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: null,
  name: "候选人",
  personalStrengths: [],
  phone: "13800138000",
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: null,
};

const MATCH: DedupMatchRecord = {
  candidateEmail: "candidate@example.com",
  candidateName: "候选人",
  candidatePhone: "13800138000",
  createdAt: "2026-06-21T00:00:00.000Z",
  id: "existing-resume",
  jobDescriptionName: null,
  status: "active",
  targetRole: "前端工程师",
};

describe("resolveResumeCreateDedupConflict", () => {
  it("returns duplicate_found for check policy when semantic matches exist", async () => {
    const findDuplicates = vi.fn().mockResolvedValue([MATCH]);

    const conflict = await resolveResumeCreateDedupConflict({
      candidateEmail: null,
      candidateName: null,
      candidatePhone: null,
      dedupPolicy: "check",
      findDuplicates,
      organizationId: "org",
      resumeProfile: PROFILE,
    });

    expect(conflict).toEqual({ matches: [MATCH], status: "duplicate_found" });
    expect(findDuplicates).toHaveBeenCalledWith({
      email: PROFILE.email,
      name: PROFILE.name,
      organizationId: "org",
      phone: PROFILE.phone,
      resumeProfile: PROFILE,
    });
  });

  it("does not check duplicates when policy is force", async () => {
    const findDuplicates = vi.fn().mockResolvedValue([MATCH]);

    const conflict = await resolveResumeCreateDedupConflict({
      candidateEmail: null,
      candidateName: null,
      candidatePhone: null,
      dedupPolicy: "force",
      findDuplicates,
      organizationId: "org",
      resumeProfile: PROFILE,
    });

    expect(conflict).toBeNull();
    expect(findDuplicates).not.toHaveBeenCalled();
  });

  it("does not block manual records without a parsed resume profile", async () => {
    const findDuplicates = vi.fn().mockResolvedValue([MATCH]);

    const conflict = await resolveResumeCreateDedupConflict({
      candidateEmail: "candidate@example.com",
      candidateName: "候选人",
      candidatePhone: "13800138000",
      dedupPolicy: "check",
      findDuplicates,
      organizationId: "org",
      resumeProfile: null,
    });

    expect(conflict).toBeNull();
    expect(findDuplicates).not.toHaveBeenCalled();
  });
});
