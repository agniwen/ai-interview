export type JobDescriptionSupplementedSection =
  | "job_responsibilities"
  | "core_skills"
  | "supporting_skills"
  | "experience"
  | "projects"
  | "education"
  | "other_requirements";

export interface JobDescriptionSupplementedItem {
  detail: string;
  section: JobDescriptionSupplementedSection;
}

export const SUPPLEMENTED_SECTION_LABELS: Record<JobDescriptionSupplementedSection, string> = {
  core_skills: "核心技能",
  education: "学历/背景",
  experience: "经验要求",
  job_responsibilities: "岗位职责",
  other_requirements: "其他任职要求",
  projects: "项目要求",
  supporting_skills: "辅助技能",
};
