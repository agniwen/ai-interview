import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";

const RESUME_TEXT_MAX_CHARS = 8000;
const JSON_CONTEXT_MAX_CHARS = 5000;

interface StudioResumeChatContextInput {
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  targetRole?: string | null;
  resumeProfile?: unknown;
  resumeReview?: unknown;
  resumeText?: string | null;
  jobDescription?: {
    name: string;
    prompt: string;
  } | null;
}

function stringifyBounded(value: unknown, maxChars: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text.trim()) {
    return null;
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[已截断]` : text;
}

export function buildStudioResumeChatContextBlock(input: StudioResumeChatContextInput): string {
  const lines = [
    "【Studio 简历上下文】",
    "当前聊天绑定的是 Studio 简历库中的候选人。请优先基于下列简历库已分析信息回答，不要声称无法看到简历。",
    `候选人：${input.candidateName}`,
  ];

  if (input.candidateEmail) {
    lines.push(`邮箱：${input.candidateEmail}`);
  }
  if (input.candidatePhone) {
    lines.push(`电话：${input.candidatePhone}`);
  }
  if (input.targetRole) {
    lines.push(`目标岗位：${input.targetRole}`);
  }
  if (input.jobDescription) {
    lines.push(`绑定 JD：${input.jobDescription.name}`);
    lines.push("JD 要求：");
    lines.push(input.jobDescription.prompt);
  }

  const profile = stringifyBounded(input.resumeProfile, JSON_CONTEXT_MAX_CHARS);
  if (profile) {
    lines.push("结构化简历画像：");
    lines.push("```json");
    lines.push(profile);
    lines.push("```");
  }

  const review = stringifyBounded(input.resumeReview, JSON_CONTEXT_MAX_CHARS);
  if (review) {
    lines.push("AI 简历分析：");
    lines.push("```json");
    lines.push(review);
    lines.push("```");
  }

  const resumeText = stringifyBounded(input.resumeText, RESUME_TEXT_MAX_CHARS);
  if (resumeText) {
    lines.push("简历原文摘录：");
    lines.push("```text");
    lines.push(resumeText);
    lines.push("```");
  }

  return lines.join("\n");
}

export async function loadStudioResumeChatContext({
  organizationId,
  resumeId,
}: {
  organizationId: string;
  resumeId: string;
}): Promise<string | null> {
  const [row] = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      jobDescriptionName: jobDescription.name,
      jobDescriptionPrompt: jobDescription.prompt,
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
      resumeText: studioInterview.resumeText,
      targetRole: studioInterview.targetRole,
    })
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, studioInterview.jobDescriptionId),
        eq(jobDescription.organizationId, organizationId),
      ),
    )
    .where(
      and(eq(studioInterview.id, resumeId), eq(studioInterview.organizationId, organizationId)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return buildStudioResumeChatContextBlock({
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    jobDescription:
      row.jobDescriptionName && row.jobDescriptionPrompt
        ? {
            name: row.jobDescriptionName,
            prompt: row.jobDescriptionPrompt,
          }
        : null,
    resumeProfile: row.resumeProfile,
    resumeReview: row.resumeReview,
    resumeText: row.resumeText,
    targetRole: row.targetRole,
  });
}
