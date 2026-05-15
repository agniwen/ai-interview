import { tool } from "ai";
import { z } from "zod";
import { selectUploadedResumePdfs } from "@/lib/shared/resume-pdf";
import { createResumeAgent } from "@/server/agents/resume-agent";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
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
      "辅助工具：列出已上传的 PDF 简历，包含序号和文件名。如果存在多份文件，应主动调用以避免文件名歧义，即使模型原生支持读取 PDF。",
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
// =====================================================================

const SUGGEST_JD_RANKER_SCHEMA = z.object({
  candidates: z
    .array(
      z.object({
        id: z.string(),
        reasons: z.string().min(1),
        score: z.number().min(0).max(100),
      }),
    )
    .min(1),
  reasoning: z.string().min(1),
  recommendedId: z.string(),
});

const SUGGEST_JD_JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)\s*```/;

function parseSuggestJdRanker(text: string) {
  const trimmed = text.trim();
  const blockMatch = SUGGEST_JD_JSON_BLOCK_RE.exec(trimmed);
  const rawCandidates = blockMatch ? [blockMatch[1], trimmed] : [trimmed];

  for (const candidate of rawCandidates) {
    if (!candidate) {
      continue;
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      continue;
    }
    try {
      const raw = JSON.parse(candidate.slice(start, end + 1));
      const parsed = SUGGEST_JD_RANKER_SCHEMA.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // continue to next candidate form
    }
  }
  return null;
}

export function createSuggestJobDescriptionTool({
  orgId,
  resumes,
}: {
  orgId: string;
  resumes: BakedParsedResume[];
}) {
  return tool({
    description:
      "当用户上传了简历 PDF 且当前未配置在招岗位时，调用此工具从后台已配置的在招岗位中智能匹配最接近的岗位。返回排序后的候选岗位列表与推荐岗位，供用户确认是否将其设置为当前对话的在招岗位。",
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

      const structuredResume = primaryResume.parsedStructured;

      // 仅传 name / description / departmentName，避免 prompt 拉爆上下文。
      // Only pass name / description / departmentName; omit prompt to keep context small.
      const jdSummary = jobDescriptions.map((jd) => ({
        departmentName: jd.departmentName ?? null,
        description: jd.description ?? "",
        id: jd.id,
        name: jd.name,
      }));

      const rankerInstructions = `你是一名招聘岗位匹配助手。根据候选人的简历结构化信息与后台已配置的在招岗位列表，按匹配度从高到低返回候选岗位排序。

【评判维度】
- 岗位关键词、核心职责、能力要求是否与候选人的技能、经历、项目相符
- 候选人过往经历的行业、职级是否匹配岗位定位
- 候选人明确的求职方向是否覆盖该岗位

【输出格式 — 严格 JSON，禁止添加额外文字或代码块以外的内容】
{
  "candidates": [
    { "id": "<岗位 id>", "score": <0-100 整数>, "reasons": "<一句话匹配原因>" }
  ],
  "recommendedId": "<分数最高的岗位 id>",
  "reasoning": "<整体匹配判断，2-3 句话>"
}

【约束】
- candidates 必须只包含输入 jobDescriptions 中真实存在的 id。
- candidates 必须按 score 降序排列，全部岗位都要出现（可用较低分数淘汰明显不匹配的）。
- 如果所有岗位都明显不匹配，仍然给出 recommendedId（取 score 最高的），并在 reasoning 中说明最匹配只是相对而言。
- 不要编造岗位信息。`;

      const rankerModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "deepseek-v4-pro";
      const rankerAgent = createResumeAgent({
        enableThinking: false,
        instructions: rankerInstructions,
        modelId: rankerModelId,
        temperature: 0,
        tools: {},
      });

      let rankerText: string;
      try {
        const { text } = await rankerAgent.generate({
          prompt: `候选人简历结构化信息：\n${JSON.stringify(structuredResume, null, 2)}\n\n已配置的在招岗位列表（只能从这些 id 中选择）：\n${JSON.stringify(
            jdSummary,
            null,
            2,
          )}`,
        });
        rankerText = text;
      } catch {
        return { reason: "ranker-failed", status: "error" as const };
      }

      const ranker = parseSuggestJdRanker(rankerText);
      if (!ranker) {
        return { reason: "ranker-parse-failed", status: "error" as const };
      }

      const jdById = new Map(jobDescriptions.map((jd) => [jd.id, jd]));
      const validRankings = ranker.candidates.filter((item) => jdById.has(item.id));
      if (validRankings.length === 0) {
        return { reason: "no-valid-candidates", status: "error" as const };
      }

      const recommendedId = jdById.has(ranker.recommendedId)
        ? ranker.recommendedId
        : validRankings[0]?.id;
      if (!recommendedId) {
        return { reason: "no-valid-candidates", status: "error" as const };
      }

      const enrichedCandidates = validRankings.map((item) => {
        const jd = jdById.get(item.id);
        return {
          departmentName: jd?.departmentName ?? null,
          id: item.id,
          name: jd?.name ?? "",
          reasons: item.reasons,
          score: item.score,
        };
      });

      return {
        candidates: enrichedCandidates,
        reasoning: ranker.reasoning,
        recommendedId,
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
 * Client-side tool — no `execute` on server. The UI renders an approval card
 * (select + confirm/ignore) and calls addToolResult once the user decides.
 */
export const applyJobDescriptionTool = tool({
  description:
    "在 suggest_job_description 返回 status === 'ok' 之后调用，把推荐结果交给用户确认。该工具不会自动执行，必须等待用户在 UI 上点击『确定』或『忽略』。output 中的 action 为 'confirm' 表示用户已把岗位设置为当前对话的在招岗位，后续分析应围绕该岗位展开；action 为 'ignore' 表示用户拒绝设置，后续按缺少 JD 分支继续。",
  inputSchema: z.object({
    candidates: z
      .array(
        z.object({
          departmentName: z.string().nullable().optional(),
          id: z.string(),
          name: z.string(),
          reasons: z.string().optional(),
          score: z.number().optional(),
        }),
      )
      .min(1)
      .describe("按匹配度降序的候选岗位；必须从 suggest_job_description 的输出原样转发"),
    reasoning: z.string().describe("给用户看的匹配理由解释，1-2 句"),
    recommendedId: z.string().describe("默认选中的推荐岗位 id"),
  }),
});
