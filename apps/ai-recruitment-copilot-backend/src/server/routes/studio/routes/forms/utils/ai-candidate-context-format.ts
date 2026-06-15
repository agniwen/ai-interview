import type { ResumeProfile } from "@arc/db-schema/interview/types";

export interface AiCandidateContext {
  candidateName: string;
  resumeProfile: ResumeProfile | null;
}

export function formatSingleResumeContext(profile: ResumeProfile | null): string {
  if (!profile) {
    return "（无简历信息）";
  }
  const parts = [
    `姓名：${profile.name}`,
    profile.targetRoles?.length ? `目标岗位：${profile.targetRoles.join("、")}` : null,
    profile.workYears === null ? null : `工作年限：${profile.workYears} 年`,
    profile.skills?.length ? `技能：${profile.skills.join("、")}` : null,
    profile.workExperiences?.length
      ? `工作经历：${profile.workExperiences.map((w) => `${w.company ?? ""}-${w.role ?? ""}`).join("；")}`
      : null,
    profile.projectExperiences?.length
      ? `项目经历：${profile.projectExperiences.map((p) => p.name ?? "").join("、")}`
      : null,
  ].filter(Boolean);
  return parts.join("\n");
}

export function formatCandidatesLabel(candidates: AiCandidateContext[]): string {
  if (candidates.length === 0) {
    return "（未指定候选人，请根据岗位与 HR 指令设计通用题目）";
  }
  const [candidate] = candidates;
  if (candidates.length === 1 && candidate) {
    return `姓名：${candidate.candidateName}`;
  }
  return `共 ${candidates.length} 位候选人：\n${candidates.map((c) => `- ${c.candidateName}`).join("\n")}`;
}

export function formatCandidatesResumeContext(candidates: AiCandidateContext[]): string {
  if (candidates.length === 0) {
    return "（无简历信息）";
  }
  const [candidate] = candidates;
  if (candidates.length === 1 && candidate) {
    return formatSingleResumeContext(candidate.resumeProfile);
  }
  return candidates
    .map((entry) => {
      const body = formatSingleResumeContext(entry.resumeProfile);
      return `### ${entry.candidateName}\n${body}`;
    })
    .join("\n\n");
}
