import { tool } from "ai";
import { z } from "zod";
import { generateResumeStructured } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import { selectUploadedResumePdfs } from "@arc/shared/resume-pdf";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import { toResumeProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-parser-agent";
import {
  findContentHashByAttachmentId,
  updateStructuredByHash,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import { listAllJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import type { BakedParsedResume } from "./agent-helpers";

export const getServerTimeTool = tool({
  description: "获取服务端当前日期与时间。当用户询问当前时间或日期时使用。",
  // oxlint-disable-next-line require-await -- AI SDK tool signature requires async execute.
  execute: async ({ timezone }) => {
    const resolvedTimeZone = timezone?.trim() || "Asia/Shanghai";

    try {
      return {
        now: new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "full",
          timeStyle: "long",
          timeZone: resolvedTimeZone,
        }).format(new Date()),
        timezone: resolvedTimeZone,
      };
    } catch {
      return {
        now: new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "full",
          timeStyle: "long",
          timeZone: "UTC",
        }).format(new Date()),
        timezone: "UTC",
        warning: "提供的时区无效，已自动回退到 UTC。",
      };
    }
  },
  inputSchema: z.object({
    timezone: z.string().describe("IANA 时区，例如 Asia/Shanghai").optional(),
  }),
});

export const getResumeReviewFrameworkTool = tool({
  description: "返回一个带权重维度的通用简历筛选框架，可用于实习生和社招岗位。",
  // oxlint-disable-next-line require-await -- AI SDK tool signature requires async execute.
  execute: async ({ seniority, targetRole }) => {
    const level = seniority ?? "general";

    return {
      dimensions: [
        {
          checklist: [
            "是否有量化的业务或产品结果",
            "是否清楚说明负责范围与角色",
            "是否使用清晰的行动-结果式表述",
          ],
          name: "影响力与结果",
          weight: 30,
        },
        {
          checklist: [
            "是否写明具体技术栈细节",
            "是否体现架构设计或权衡思路",
            "是否体现性能、稳定性或扩展性相关工作",
          ],
          name: "技术深度",
          weight: 25,
        },
        {
          checklist: [
            "是否匹配目标岗位关键词",
            "项目经历是否与岗位职责相关",
            "内容排序和重点是否支撑岗位匹配度",
          ],
          name: "岗位相关性",
          weight: 20,
        },
        {
          checklist: [
            "项目符号和表述是否简洁",
            "时间线与格式是否一致",
            "层级是否清晰、便于快速扫读",
          ],
          name: "结构与可读性",
          weight: 15,
        },
        {
          checklist: [
            "是否避免夸大或失真的表述",
            "是否提供可验证的链接或作品",
            "成果是否具备清晰上下文",
          ],
          name: "信号可信度",
          weight: 10,
        },
      ],
      seniority: level,
      targetRole: targetRole ?? "软件工程岗位",
    };
  },
  inputSchema: z.object({
    seniority: z.enum(["general", "intern", "junior", "mid", "senior"]).optional(),
    targetRole: z.string().describe("目标岗位，例如前端开发").optional(),
  }),
});

export function createListUploadedResumePdfsTool({
  availableResumeNames,
}: {
  availableResumeNames: string[];
}) {
  return tool({
    description:
      "辅助工具：列出已上传的简历文件，包含序号和文件名。如果存在多份文件，应主动调用以避免文件名歧义。",
    // oxlint-disable-next-line require-await -- AI SDK tool signature requires async execute.
    execute: async () => ({
      count: availableResumeNames.length,
      resumes: availableResumeNames,
    }),
    inputSchema: z.object({}),
  });
}

// =====================================================================
// Job description suggestion (server) + approval (client)
//
// 改造目标：与简历库 /api/interview/match-job-description 行为对齐 —— 一次
// LLM 调用，直接产出"推荐这一个岗位 + 一句话理由"，前端只展示一张推荐卡片
// （不再是排序下拉）。
// Aligns with the resume-library matcher: a single LLM call that returns
// one recommendation + reason; UI shows a one-pick approval card.
// =====================================================================

export function createSuggestJobDescriptionTool({
  orgId,
  resumes,
}: {
  orgId: string;
  resumes: BakedParsedResume[];
}) {
  return tool({
    description:
      "当用户上传了简历文件且当前未配置在招岗位时，调用此工具从后台已配置的在招岗位中智能匹配最接近的岗位。返回单个推荐岗位与简短理由，供用户在 UI 上点击确认或忽略。",
    execute: async ({ resumeName }) => {
      // 直接消费 message 里 baked 好的解析结果，不做任何 OCR / DB 读取。
      // 没有 baked 数据就直接当作"没简历"返回，让上层依据 system prompt 提示用户重传。
      // Consume the parsed data already baked into the message — no OCR / DB.
      // If nothing baked, return as "no-resume" and let the prompt instruct
      // the user to re-upload.
      if (resumes.length === 0) {
        return { status: "no-resume" as const };
      }

      const availableResumeNames = resumes.map((r, i) => `${i + 1}. ${r.filename}`);
      const selected = selectUploadedResumePdfs(resumes, resumeName);
      if (selected.length === 0) {
        return { availableResumes: availableResumeNames, status: "no-resume" as const };
      }

      const jobDescriptions = await listAllJobDescriptions(orgId);
      if (jobDescriptions.length === 0) {
        return { status: "no-jds" as const };
      }

      const [primaryResume] = selected;
      if (!primaryResume) {
        return { status: "no-resume" as const };
      }

      // ResumeProfile 是 matcher 必需的输入。三分支处理：
      //   - 烤入消息时已有 structured（老路径，或前次 on-demand 跑过）→ 直接投影
      //   - 烤入只有 OCR 文本（新的 chat 上传 OCR-only 主路径）→ on-demand 跑
      //     generateResumeStructured，并通过 updateStructuredByHash 把结果回填到
      //     chat_attachment，下次再撞到同 hash 直接走 cache。
      //   - 两者都没（极端情况）→ 当作"no-resume"返回
      // matcher needs a ResumeProfile. Three sub-cases:
      //   - structured already baked → project directly.
      //   - only OCR text baked (the new OCR-only chat upload path) → run
      //     generateResumeStructured on demand and write the result back via
      //     updateStructuredByHash so the next hit on the same hash is cached.
      //   - neither → return as "no-resume".
      let profile;
      if (primaryResume.parsedStructured) {
        profile = toResumeProfile(primaryResume.parsedStructured);
      } else if (primaryResume.parsedText && primaryResume.parsedText.trim().length > 0) {
        try {
          const structured = await generateResumeStructured(primaryResume.parsedText);
          // 用 attachmentId 反查 contentHash（chat 上传时算的是 PDF 字节 hash，
          // 这里手头只有 OCR 文本，不能重算），然后回填同 hash 全部行。
          // Look up contentHash by attachmentId — the chat upload hash is over
          // raw PDF bytes; we can't re-derive it from OCR text alone. Once we
          // have the hash, fan out the backfill to every row sharing it.
          const contentHash = await findContentHashByAttachmentId(primaryResume.attachmentId);
          if (contentHash) {
            await updateStructuredByHash(contentHash, structured).catch((error) => {
              console.warn("[suggest_jd] updateStructuredByHash backfill failed:", error);
            });
          }
          profile = toResumeProfile(structured);
        } catch (error) {
          // 区分"结构化抽取这一步失败"与"matcher 找不到合适岗位"——前者是 LLM
          // 调用抖动/超时，应该建议重试；后者是数据层面没有匹配项。两者复用同一个
          // reason 会让 LLM 把技术性失败说成"没有合适岗位"，误导用户。
          // Distinguish "structured extraction step failed" from "matcher
          // found nothing". The former is an LLM hiccup that warrants a retry
          // hint; the latter is a real data shortage. Reusing one reason
          // misled the LLM into framing transient failures as "no JD fits".
          console.error("[suggest_jd] on-demand structured extraction failed:", error);
          return { reason: "structured-extraction-failed" as const, status: "error" as const };
        }
      } else {
        return { status: "no-resume" as const };
      }

      const match = await matchJobDescriptionForResume(profile, jobDescriptions);
      if (!match) {
        return { reason: "no-valid-candidates", status: "error" as const };
      }

      const matchedJd = jobDescriptions.find((jd) => jd.id === match.jobDescriptionId);
      if (!matchedJd) {
        return { reason: "no-valid-candidates", status: "error" as const };
      }

      return {
        recommended: {
          departmentName: matchedJd.departmentName ?? null,
          id: matchedJd.id,
          name: matchedJd.name,
          reason: match.reason ?? "",
        },
        status: "ok" as const,
      };
    },
    inputSchema: z.object({
      resumeName: z
        .string()
        .optional()
        .describe(
          "仅在上传了多份简历且需要指向具体一份时传入，用从 1 开始的纯数字序号（如 '1'、'2'）；单份简历时不要传此参数，也不要传完整文件名。",
        ),
    }),
  });
}

/**
 * Client-side tool — no `execute` on server. The UI renders a single
 * recommendation card (no dropdown) with confirm/ignore buttons and calls
 * addToolResult once the user decides.
 */
export const applyJobDescriptionTool = tool({
  description:
    "在 suggest_job_description 返回 status === 'ok' 之后调用，把推荐岗位交给用户确认。该工具不会自动执行，必须等待用户在 UI 上点击『确定』或『忽略』。output 中的 action 为 'confirm' 表示用户已将该岗位设为当前对话的在招岗位；action 为 'ignore' 表示用户拒绝，后续按缺 JD 分支继续。",
  inputSchema: z.object({
    recommended: z
      .object({
        departmentName: z.string().nullable().optional(),
        id: z.string(),
        name: z.string(),
        reason: z.string().describe("一句话说明为什么推荐这个岗位"),
      })
      .describe("从 suggest_job_description 的输出 `recommended` 原样转发"),
  }),
});
