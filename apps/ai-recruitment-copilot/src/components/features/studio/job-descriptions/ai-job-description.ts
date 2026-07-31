export type JobDescriptionSupplementedSection =
  | "job_responsibilities"
  | "core_skills"
  | "supporting_skills"
  | "experience"
  | "projects"
  | "education"
  | "potential_stability";

export interface JobDescriptionSupplementedItem {
  detail: string;
  section: JobDescriptionSupplementedSection;
}

export const SUPPLEMENTED_SECTION_LABELS: Record<JobDescriptionSupplementedSection, string> = {
  core_skills: "核心技能",
  education: "学历/背景",
  experience: "经验要求",
  job_responsibilities: "岗位职责",
  potential_stability: "潜力与稳定性",
  projects: "项目要求",
  supporting_skills: "辅助技能",
};
