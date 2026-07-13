import type { ResumeProfile } from "@arc/db-schema/interview/types";

export type ResumeSemanticChunkType = "resume_overview" | "skill_role" | "work_project";

export interface ResumeSemanticTextChunk {
  chunkType: ResumeSemanticChunkType;
  text: string;
}

const PLACEHOLDER = "未发现信息";

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === PLACEHOLDER) {
    return null;
  }
  return trimmed.replaceAll(/\s+/g, " ");
}

function cleanList(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set(
      values
        ?.map((value) => cleanText(value))
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
}

function line(label: string, value: string | number | null | undefined): string | null {
  if (typeof value === "number") {
    return `${label}：${value}`;
  }
  const cleaned = cleanText(value);
  return cleaned ? `${label}：${cleaned}` : null;
}

function listLine(label: string, values: readonly string[] | null | undefined): string | null {
  const cleaned = cleanList(values);
  return cleaned.length > 0 ? `${label}：${cleaned.join("、")}` : null;
}

function section(title: string, lines: (string | null)[]): string | null {
  const body = lines.filter((value): value is string => typeof value === "string");
  if (body.length === 0) {
    return null;
  }
  return [`## ${title}`, ...body].join("\n");
}

function compactJoin(values: (string | null)[]): string {
  return values.filter((value): value is string => typeof value === "string").join("\n\n");
}

function latestWork(profile: ResumeProfile) {
  return profile.workExperiences[0] ?? null;
}

export interface JobDescriptionSemanticInput {
  departmentName: string | null;
  description: string | null;
  id: string;
  name: string;
  prompt: string;
}

// JD 侧沿用旧 recommendations.ts 的语义：section 恒非空(空 body 也返回 `## 标题`),
// 避免空字符串流入 embedding API。
function sectionOrHeader(title: string, lines: (string | null)[]): string {
  return section(title, lines) ?? `## ${title}`;
}

export function buildJobDescriptionSemanticTexts(
  jd: JobDescriptionSemanticInput,
): ResumeSemanticTextChunk[] {
  const name = cleanText(jd.name);
  const departmentName = cleanText(jd.departmentName);
  const description = cleanText(jd.description);
  const prompt = cleanText(jd.prompt);

  return [
    {
      chunkType: "resume_overview",
      text: sectionOrHeader("岗位概览", [
        name ? `岗位名称：${name}` : null,
        departmentName ? `所属部门：${departmentName}` : null,
        description ? `岗位描述：${description}` : null,
      ]),
    },
    {
      chunkType: "work_project",
      text: sectionOrHeader("职责和业务场景", [
        description ? `业务描述：${description}` : null,
        prompt ? `面试官提示：${prompt}` : null,
      ]),
    },
    {
      chunkType: "skill_role",
      text: sectionOrHeader("岗位和技能要求", [
        name ? `目标岗位：${name}` : null,
        prompt ? `能力要求：${prompt}` : null,
        description ? `补充描述：${description}` : null,
      ]),
    },
  ];
}

export function buildResumeSemanticTexts(profile: ResumeProfile): ResumeSemanticTextChunk[] {
  const recentWork = latestWork(profile);
  const educationSummary = profile.educationExperiences?.map((item) =>
    [
      cleanText(item.school),
      cleanText(item.educationLevel),
      cleanText(item.degree),
      cleanText(item.major),
      cleanText(item.graduationYear),
      cleanText(item.period),
      cleanText(item.summary),
    ]
      .filter(Boolean)
      .join(" / "),
  );

  const workLines = profile.workExperiences.map((item, index) =>
    [
      `${index + 1}.`,
      cleanText(item.company),
      cleanText(item.role),
      cleanText(item.period),
      cleanText(item.summary),
    ]
      .filter(Boolean)
      .join(" / "),
  );
  const projectLines = profile.projectExperiences.map((item, index) =>
    [
      `${index + 1}.`,
      cleanText(item.name),
      cleanText(item.role),
      cleanText(item.period),
      listLine("技术栈", item.techStack),
      cleanText(item.summary),
    ]
      .filter(Boolean)
      .join(" / "),
  );

  const resumeOverview = compactJoin([
    section("候选人概览", [
      line("候选人", profile.name),
      line("工作年限", profile.workYears),
      listLine("目标岗位", profile.targetRoles),
      listLine("学校", profile.schools),
      listLine("技能", profile.skills),
      recentWork
        ? line(
            "最近工作",
            [
              cleanText(recentWork.company),
              cleanText(recentWork.role),
              cleanText(recentWork.period),
            ]
              .filter(Boolean)
              .join(" / "),
          )
        : null,
    ]),
    section("教育经历", educationSummary?.filter(Boolean) ?? []),
    section("个人优势", cleanList(profile.personalStrengths)),
  ]);

  const workProject = compactJoin([
    section("工作经历", workLines),
    section("项目经历", projectLines),
  ]);

  const skillRole = compactJoin([
    section("岗位和技能", [
      listLine("目标岗位", profile.targetRoles),
      listLine("核心技能", profile.skills),
      line("工作年限", profile.workYears),
      recentWork ? line("最近岗位", cleanText(recentWork.role)) : null,
      recentWork ? line("最近公司", cleanText(recentWork.company)) : null,
    ]),
  ]);

  return [
    { chunkType: "resume_overview", text: resumeOverview },
    { chunkType: "work_project", text: workProject },
    { chunkType: "skill_role", text: skillRole },
  ];
}
