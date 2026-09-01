import type { ResumeScreeningPolicy } from "@arc/shared/resume-screening";
import { z } from "zod";
import { requestWorkspaceAiJson } from "../forms/ai-question-generation.js";

const supplementedSectionSchema = z.enum([
  "job_responsibilities",
  "core_skills",
  "supporting_skills",
  "experience",
  "projects",
  "education",
  "other_requirements",
]);
const jobDraftSchema = z.object({
  jobDescription: z.string().trim().min(1).max(10_000),
  suggestedName: z.string().trim().min(1).max(120),
  supplementedItems: z
    .array(
      z.object({
        detail: z.string().trim().min(1).max(200),
        section: supplementedSectionSchema,
      }),
    )
    .max(7),
});
const screeningDraftSchema = z.object({
  minimumEducation: z.enum(["none", "专科", "本科", "硕士", "博士"]),
  minimumEducationSeverity: z.enum(["info", "warning", "blocking"]),
  minimumWorkYears: z.number().int().min(0).nullable(),
  minimumWorkYearsSeverity: z.enum(["info", "warning", "blocking"]),
  requiredSkills: z.array(z.string().trim().min(1)).max(20),
  requiredSkillsMatchMode: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ count: z.number().int().min(1), type: z.literal("at_least") }),
  ]),
  requiredSkillsSeverity: z.enum(["info", "warning", "blocking"]),
  semanticRequirements: z
    .array(
      z.object({
        requirement: z.string().trim().min(1).max(200),
        severity: z.enum(["info", "warning", "blocking"]),
      }),
    )
    .max(10),
});

const lineTokenPattern = /⟦JD_LINE_(\d{4})⟧/g;
function tokenize(value: string) {
  const lines = value
    .replaceAll("\r\n", "\n")
    .trim()
    .split("\n")
    .map((line, index) => {
      const heading = /^(#{1,6}\s+)(.*)$/.exec(line);
      const list = /^(\s*(?:-|\*|\+|\d+[.)])\s+)(.*)$/.exec(line);
      const plain = /^(\s*)(.*)$/.exec(line);
      return {
        content: heading?.[2] ?? list?.[2] ?? plain?.[2] ?? "",
        prefix: heading?.[1] ?? list?.[1] ?? plain?.[1] ?? "",
        token: `⟦JD_LINE_${index.toString().padStart(4, "0")}⟧`,
      };
    });
  return { lines, prompt: lines.map((line) => `${line.token}${line.content}`).join("\n") };
}

function restore(original: ReturnType<typeof tokenize>, generated: string) {
  const matches = [...generated.matchAll(lineTokenPattern)];
  if (
    matches.length !== original.lines.length ||
    matches.some((match, index) => match[0] !== original.lines[index]?.token)
  ) {
    return {
      jobDescription: original.lines.map((line) => `${line.prefix}${line.content}`).join("\n"),
      usedGeneratedContent: false,
    };
  }
  return {
    jobDescription: original.lines
      .map((line, index) => {
        if (!line.content) {
          return "";
        }
        const start = (matches[index]?.index ?? 0) + line.token.length;
        const end = matches[index + 1]?.index ?? generated.length;
        return `${line.prefix}${generated.slice(start, end).replaceAll(/\s+/g, " ").trim() || line.content}`;
      })
      .join("\n"),
    usedGeneratedContent: true,
  };
}

export async function generateJobDraft(input: {
  departmentName?: string;
  jobName?: string;
  prompt: string;
}) {
  const tokenized = tokenize(input.prompt);
  const prompt = `你是招聘岗位文案助手。请在保留原始结构和排版的前提下优化岗位 JD。原文的每一行都有 ⟦JD_LINE_0000⟧ 标记；必须保留全部标记、顺序和数量，只能优化标记后的文字，空行不得填写内容。\n岗位名称：${input.jobName || "（未填写，请根据指令生成）"}\n所属部门：${input.departmentName || "（未指定）"}\n原始 JD：\n${tokenized.prompt}\n只输出 JSON：{"jobDescription":"带原标记的完整 JD","suggestedName":"岗位名称","supplementedItems":[{"section":"job_responsibilities|core_skills|supporting_skills|experience|projects|education|other_requirements","detail":"主动补充的信息"}]}。不得增加原文不存在的章节；不得输出评分、权重或内部筛选内容。`;
  const draft = jobDraftSchema.parse(await requestWorkspaceAiJson(prompt));
  const restored = restore(tokenized, draft.jobDescription);
  return {
    ...draft,
    jobDescription: restored.jobDescription,
    supplementedItems: restored.usedGeneratedContent ? draft.supplementedItems : [],
  };
}

export async function generateScreeningPolicy(input: {
  description?: string | null;
  name?: string | null;
  prompt: string;
}): Promise<ResumeScreeningPolicy> {
  const prompt = `你是招聘筛选规则草稿助手。只从 JD 明确出现或强烈表达的内容提取可确认、可复评的简历筛选规则，不得臆测，不得自动淘汰。\n岗位名称：${input.name || "（未填写）"}\n岗位描述：${input.description || "（未填写）"}\n岗位 JD：${input.prompt}\n只输出 JSON：{"minimumEducation":"none|专科|本科|硕士|博士","minimumEducationSeverity":"info|warning|blocking","minimumWorkYears":null,"minimumWorkYearsSeverity":"info|warning|blocking","requiredSkills":[],"requiredSkillsMatchMode":{"type":"all"},"requiredSkillsSeverity":"info|warning|blocking","semanticRequirements":[{"requirement":"要求","severity":"info|warning|blocking"}]}。只有明确的必须/至少才用 blocking，优先/加分用 warning。`;
  const draft = screeningDraftSchema.parse(await requestWorkspaceAiJson(prompt));
  const rules: ResumeScreeningPolicy["rules"] = [];
  if (draft.minimumEducation !== "none") {
    rules.push({
      field: "minimumEducation",
      id: "minimum-education",
      level: draft.minimumEducation,
      severity: draft.minimumEducationSeverity,
      type: "field",
    });
  }
  if (draft.minimumWorkYears !== null) {
    rules.push({
      field: "minimumWorkYears",
      id: "minimum-work-years",
      severity: draft.minimumWorkYearsSeverity,
      type: "field",
      years: draft.minimumWorkYears,
    });
  }
  const skills = draft.requiredSkills.map((skill) => skill.trim()).filter(Boolean);
  if (skills.length) {
    rules.push({
      id: "required-skills",
      matchMode:
        draft.requiredSkillsMatchMode.type === "all"
          ? { type: "all" }
          : {
              count: Math.max(1, Math.min(draft.requiredSkillsMatchMode.count, skills.length)),
              type: "at_least",
            },
      requiredSkills: skills,
      severity: draft.requiredSkillsSeverity,
      type: "skill",
    });
  }
  for (const [index, item] of draft.semanticRequirements.entries()) {
    rules.push({
      id: `semantic-${index + 1}`,
      requirement: item.requirement,
      severity: item.severity,
      type: "semantic",
    });
  }
  return { enabled: rules.length > 0, rules, version: 1 };
}
