import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import type { ResumeProfile } from "@/lib/interview/types";
import { z } from "zod";
import { createResumeAgent } from "./resume-agent";

const MATCH_INSTRUCTIONS = `你是一名招聘匹配助手。你会收到候选人的结构化简历信息与一份在招岗位候选列表，请从中挑选与候选人最匹配的一个。

## 匹配判断依据（按重要性由高到低）
1. 候选人的 targetRoles（求职岗位）是否与在招岗位的 name/description 语义一致。
2. 候选人的 skills、workExperiences、projectExperiences 中出现的技术栈、业务领域是否与岗位描述匹配。
3. 候选人的 workYears、教育背景是否满足岗位的经验层级（若岗位描述中有提及）。
4. 若简历信息明显不足或没有任何候选岗位真正贴合，仍必须从候选列表中挑选最接近的一个；不能返回空值。

## 输出要求
严格输出 JSON，结构如下：

{
  "jobDescriptionId": string,   // 必须是候选列表中存在的 id
  "reason": string              // 一句简短中文说明，解释为何选中（不超过 80 字）
}

不要输出额外字段、解释或 markdown 代码块以外的内容。`;

const matchResultSchema = z.object({
  jobDescriptionId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)\s*```/;

function parseMatchOutput(text: string) {
  const trimmed = text.trim();
  const blockMatch = JSON_BLOCK_RE.exec(trimmed);
  const candidates = blockMatch ? [blockMatch[1], trimmed] : [trimmed];

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      continue;
    }

    try {
      const raw = JSON.parse(candidate.slice(start, end + 1));
      const parsed = matchResultSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

function summarizeJobDescription(jd: JobDescriptionListRecord) {
  const departmentPrefix = jd.departmentName ? `${jd.departmentName} / ` : "";
  const description = jd.description?.trim() || "（无描述）";
  const promptExcerpt = jd.prompt.trim().slice(0, 400);

  return [
    `- id: ${jd.id}`,
    `  岗位: ${departmentPrefix}${jd.name}`,
    `  描述: ${description}`,
    `  岗位 prompt 节选: ${promptExcerpt}`,
  ].join("\n");
}

function safeString(value: string | null) {
  return value ?? "未发现信息";
}

function summarizeResumeProfile(profile: ResumeProfile) {
  const workExperiences = profile.workExperiences
    .slice(0, 5)
    .map(
      (item) =>
        `    · ${safeString(item.company)} / ${safeString(item.role)} / ${safeString(item.period)} — ${safeString(item.summary)}`,
    )
    .join("\n");
  const projectExperiences = profile.projectExperiences
    .slice(0, 5)
    .map(
      (item) =>
        `    · ${safeString(item.name)} / ${safeString(item.role)} — 技术栈: ${item.techStack.join("、") || "未发现信息"}`,
    )
    .join("\n");

  return [
    `姓名: ${profile.name}`,
    `求职岗位: ${profile.targetRoles.join("、") || "未发现信息"}`,
    `工作年限: ${profile.workYears ?? "未发现信息"}`,
    `技能: ${profile.skills.join("、") || "未发现信息"}`,
    `个人优势: ${profile.personalStrengths.join("、") || "未发现信息"}`,
    `工作经历:\n${workExperiences || "    · 无"}`,
    `项目经历:\n${projectExperiences || "    · 无"}`,
  ].join("\n");
}

export interface JobDescriptionMatchResult {
  jobDescriptionId: string;
  reason: string | null;
}

export async function matchJobDescriptionForResume(
  resumeProfile: ResumeProfile,
  candidates: JobDescriptionListRecord[],
): Promise<JobDescriptionMatchResult | null> {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return { jobDescriptionId: candidates[0].id, reason: "候选岗位只有一个，默认选择。" };
  }

  const modelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max";
  const agent = createResumeAgent({
    enableThinking: false,
    instructions: MATCH_INSTRUCTIONS,
    modelId,
    temperature: 0,
    tools: {},
  });

  const candidateBlock = candidates.map(summarizeJobDescription).join("\n\n");
  const resumeBlock = summarizeResumeProfile(resumeProfile);

  const prompt = `候选人信息：\n${resumeBlock}\n\n候选在招岗位列表：\n${candidateBlock}\n\n请从上面的 id 中挑选一个最匹配的，并按规定 JSON 结构输出。`;

  const { text } = await agent.generate({ prompt });
  const parsed = parseMatchOutput(text);

  if (!parsed) {
    return null;
  }

  const matched = candidates.find((jd) => jd.id === parsed.jobDescriptionId);
  if (!matched) {
    return null;
  }

  return { jobDescriptionId: matched.id, reason: parsed.reason };
}
