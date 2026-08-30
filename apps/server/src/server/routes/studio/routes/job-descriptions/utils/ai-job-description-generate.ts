import { z } from "zod";
import {
  generateStructuredWithMastraAgent,
  jobDescriptionDraftAgent,
} from "@app/server/server/agents/mastra/agents/simple-generators";

const JOB_DESCRIPTION_PROMPT = `你是一名招聘岗位文案助手。请根据 HR 的原始岗位 JD 和上下文，优化成一份可直接编辑并发布到外部招聘平台的岗位 JD。

## HR 原始岗位 JD（最高优先级，必须保留原有格式）
{hrPrompt}

原 JD 已按行加入 ⟦JD_LINE_0000⟧ 形式的只读标记。jobDescription 必须保留全部标记、原顺序和原数量，不得修改、删除或新增标记；只能优化每个标记后的文字。空行标记后不得填写内容。系统会在返回 HR 前移除标记并还原原排版。

## 岗位名称
{jobName}

## 所属部门
{departmentName}

## 输出要求
- jobDescription：可直接发布到外部招聘平台的完整岗位 JD
  - 必须保留原文的标题数量与层级、章节顺序、编号方式、列表类型和整体排版风格，不得增删章节或强制套用固定模板；可优化标题措辞
  - 原文没有标题或列表时，不得擅自增加标题或列表；在原有格式内优化措辞、消除重复并补全信息
  - 要求应尽量明确、可判断，避免“能力优秀”“经验丰富”等空泛表述
  - HR 未提供但岗位配置需要的信息，可以结合岗位合理补充；不得虚构公司内部制度、薪资或福利
  - 不得在正文中出现“建议值”“请 HR 确认”等内部提示；所有主动补充统一通过 supplementedItems 告知 HR
  - 不得输出潜力评估、稳定性评估、评分维度、权重、扣分规则等内部筛选内容
  - 保持与原文篇幅相称，不为达到字数而扩写
- suggestedName：若岗位名称为空或未命名，给出简洁的中文岗位名称；若已有名称则原样返回
- supplementedItems：仅列出 HR 原始指令中没有明确说明、但你在 jobDescription 中主动补充的信息
  - section 只能使用 job_responsibilities、core_skills、supporting_skills、experience、projects、education、other_requirements
  - 每个 section 最多返回一项；同类补充合并到一条 detail 中
  - detail 用一句中文说明具体补充了什么，不能只写分类名称
  - 任何新增的数值阈值、项目规模、工具名称、专业背景或适应性要求，都必须纳入对应 section 的 detail，不能遗漏
  - 仅优化措辞或结构不算补充；没有主动补充时返回空数组
- 使用中文，除非 HR 指令要求英文

## 输出 JSON 结构（必须严格遵守，仅输出 JSON 对象）
{
  "jobDescription": "⟦JD_LINE_0000⟧优化后的第一行\n⟦JD_LINE_0001⟧\n⟦JD_LINE_0002⟧优化后的第三行",
  "suggestedName": "岗位名称",
  "supplementedItems": [
    {
      "section": "core_skills",
      "detail": "补充了可量化的核心技能实操要求"
    }
  ]
}
顶层字段名必须是 jobDescription、suggestedName、supplementedItems。请直接返回 JSON，不要用 markdown 代码块包裹。`;

const supplementedSectionSchema = z.enum([
  "job_responsibilities",
  "core_skills",
  "supporting_skills",
  "experience",
  "projects",
  "education",
  "other_requirements",
]);

const generationSchema = z.object({
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

export interface GeneratedJobDescriptionContent {
  jobDescription: string;
  suggestedName: string;
  supplementedItems: {
    detail: string;
    section: z.infer<typeof supplementedSectionSchema>;
  }[];
}

const LINE_TOKEN_PATTERN = /⟦JD_LINE_(\d{4})⟧/g;

interface TokenizedJobDescription {
  lines: { content: string; prefix: string; token: string }[];
  prompt: string;
}

interface RestoredJobDescription {
  jobDescription: string;
  usedGeneratedContent: boolean;
}

export function tokenizeJobDescription(value: string): TokenizedJobDescription {
  const lines = value
    .replaceAll("\r\n", "\n")
    .trim()
    .split("\n")
    .map((line, index) => {
      const heading = /^(#{1,6}\s+)(.*)$/.exec(line);
      const list = /^(\s*(?:-|\*|\+|\d+[.)])\s+)(.*)$/.exec(line);
      const plain = /^(\s*)(.*)$/.exec(line);
      const prefix = heading?.[1] ?? list?.[1] ?? plain?.[1] ?? "";
      const content = heading?.[2] ?? list?.[2] ?? plain?.[2] ?? "";
      return {
        content,
        prefix,
        token: `⟦JD_LINE_${index.toString().padStart(4, "0")}⟧`,
      };
    });
  return {
    lines,
    prompt: lines.map((line) => `${line.token}${line.content}`).join("\n"),
  };
}

export function restoreTokenizedJobDescription(
  original: TokenizedJobDescription,
  generated: string,
): RestoredJobDescription {
  const matches = [...generated.matchAll(LINE_TOKEN_PATTERN)];
  if (
    matches.length !== original.lines.length ||
    matches.some((match, index) => match[0] !== original.lines[index]?.token)
  ) {
    return {
      jobDescription: original.lines.map((line) => `${line.prefix}${line.content}`).join("\n"),
      usedGeneratedContent: false,
    };
  }

  const restoredLines = original.lines.map((line, index) => {
    if (!line.content) {
      return "";
    }
    const start = (matches[index]?.index ?? 0) + line.token.length;
    const end = matches[index + 1]?.index ?? generated.length;
    const content = generated.slice(start, end).replaceAll(/\s+/g, " ").trim();
    return `${line.prefix}${content || line.content}`;
  });
  return { jobDescription: restoredLines.join("\n"), usedGeneratedContent: true };
}

export async function generateJobDescriptionFromPrompt(options: {
  departmentName: string | null;
  hrPrompt: string;
  jobName: string | null;
}): Promise<GeneratedJobDescriptionContent> {
  const tokenizedPrompt = tokenizeJobDescription(options.hrPrompt);
  const prompt = JOB_DESCRIPTION_PROMPT.replace("{hrPrompt}", tokenizedPrompt.prompt)
    .replace("{jobName}", options.jobName?.trim() || "（未填写，请根据指令生成）")
    .replace("{departmentName}", options.departmentName?.trim() || "（未指定）");

  const result = await generateStructuredWithMastraAgent({
    agent: jobDescriptionDraftAgent,
    prompt,
    retryOnInvalid: true,
    schema: generationSchema,
    temperature: 0.3,
  });
  const restored = restoreTokenizedJobDescription(tokenizedPrompt, result.jobDescription);
  return {
    ...result,
    jobDescription: restored.jobDescription,
    supplementedItems: restored.usedGeneratedContent ? result.supplementedItems : [],
  };
}
