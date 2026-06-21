import type { ResumeProfile } from "@arc/db-schema/interview/types";

export interface VectorSimilarityScores {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}

export interface ResumeDuplicateRerankInput {
  candidateProfile: ResumeProfile | null;
  queryProfile: ResumeProfile;
  vectorScores: VectorSimilarityScores;
}

export interface ResumeDuplicateRerankResult {
  conflictingSignals: string[];
  level: "high" | "low" | "medium";
  reasons: string[];
  score: number;
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function setOverlap(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left.map(normalize).filter(Boolean));
  const b = new Set(right.map(normalize).filter(Boolean));
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const value of a) {
    if (b.has(value)) {
      shared += 1;
    }
  }
  return shared / Math.max(a.size, b.size);
}

function firstWork(profile: ResumeProfile) {
  return profile.workExperiences[0] ?? null;
}

function hasSameRecentCompany(left: ResumeProfile, right: ResumeProfile): boolean {
  const leftCompany = normalize(firstWork(left)?.company);
  const rightCompany = normalize(firstWork(right)?.company);
  return Boolean(leftCompany && rightCompany && leftCompany === rightCompany);
}

function hasSameSchool(left: ResumeProfile, right: ResumeProfile): boolean {
  return setOverlap(left.schools, right.schools) > 0;
}

function levelForScore(score: number): "high" | "low" | "medium" {
  if (score >= 92) {
    return "high";
  }
  if (score >= 75) {
    return "medium";
  }
  return "low";
}

// oxlint-disable-next-line complexity -- scoring intentionally combines vector and structured resume signals.
export function rerankResumeDuplicate(
  input: ResumeDuplicateRerankInput,
): ResumeDuplicateRerankResult {
  const vectorMax = Math.max(
    input.vectorScores.resumeOverview ?? 0,
    input.vectorScores.skillRole ?? 0,
    input.vectorScores.workProject ?? 0,
  );
  const reasons: string[] = [];
  const conflictingSignals: string[] = [];

  if ((input.vectorScores.workProject ?? 0) >= 0.9) {
    reasons.push("工作/项目经历语义高度相似");
  }
  if ((input.vectorScores.resumeOverview ?? 0) >= 0.88) {
    reasons.push("简历整体画像相似");
  }
  if ((input.vectorScores.skillRole ?? 0) >= 0.85) {
    reasons.push("技能与目标岗位相似");
  }

  let structuredScore = 0;
  if (input.candidateProfile) {
    const skillOverlap = setOverlap(input.queryProfile.skills, input.candidateProfile.skills);
    if (skillOverlap >= 0.5) {
      reasons.push(`技能栈重合度 ${Math.round(skillOverlap * 100)}%`);
    }
    if (hasSameRecentCompany(input.queryProfile, input.candidateProfile)) {
      structuredScore += 0.5;
      reasons.push("最近工作公司一致");
    }
    if (hasSameSchool(input.queryProfile, input.candidateProfile)) {
      structuredScore += 0.25;
      reasons.push("教育经历存在相同学校");
    }
    structuredScore += Math.min(skillOverlap, 1) * 0.25;

    if (
      normalize(input.queryProfile.email) &&
      normalize(input.candidateProfile.email) &&
      normalize(input.queryProfile.email) !== normalize(input.candidateProfile.email)
    ) {
      conflictingSignals.push("邮箱不同");
    }
    if (
      normalize(input.queryProfile.phone) &&
      normalize(input.candidateProfile.phone) &&
      normalize(input.queryProfile.phone) !== normalize(input.candidateProfile.phone)
    ) {
      conflictingSignals.push("手机号不同");
    }
  }

  const score = Math.min(100, Math.round(vectorMax * 85 + Math.min(structuredScore, 1) * 15));

  return {
    conflictingSignals,
    level: levelForScore(score),
    reasons: [...new Set(reasons)].slice(0, 8),
    score,
  };
}
