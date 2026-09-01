/* oxlint-disable max-lines -- The six request-scoped Copilot tools share one authorization boundary. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { ChatContextBindings } from "@arc/db-schema/chat-context-bindings";
import { jobDescription, resumePoolItem, studioInterview } from "@arc/db-schema/schema";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";

export type RecruitingVisibilityScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "restricted"; userIds: string[] };

export interface RecruitingCopilotFocus {
  id: string;
  kind: "resume_record";
}

const searchInputSchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
  query: z.string().trim().max(120).optional(),
});
const idsInputSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(5) });
const detailRequestsInputSchema = z.object({
  requests: z
    .array(z.object({ id: z.string().min(1), includeResumeText: z.boolean().optional() }))
    .min(1)
    .max(5),
});
const proposalTypeSchema = z.enum([
  "bind_candidate_to_job",
  "bind_pool_item_to_job",
  "advance_candidate_stage",
  "generate_interview_questions",
]);
const proposalInputSchema = z.object({
  explanation: z.string().trim().min(1).max(600),
  payload: z.record(z.string(), z.json()),
  title: z.string().trim().min(1).max(120),
  type: proposalTypeSchema,
});
const nonBindingProposalInputSchema = proposalInputSchema.extend({
  type: z.enum(["advance_candidate_stage", "generate_interview_questions"]),
});
const proposalOutputSchema = z.object({
  confirmation: z
    .object({
      confirmedAt: z.string(),
      jobDescriptionId: z.string().optional(),
      jobDescriptionName: z.string().nullable().optional(),
      status: z.enum(["confirmed", "ignored"]),
    })
    .optional(),
  proposal: proposalInputSchema.extend({ id: z.string() }),
});

function visibilityCondition(scope: RecruitingVisibilityScope) {
  if (scope.kind === "none") {
    return eq(studioInterview.id, "__none__");
  }
  return scope.kind === "restricted"
    ? inArray(studioInterview.createdBy, scope.userIds)
    : undefined;
}

function poolVisibilityCondition(scope: RecruitingVisibilityScope, organizationId: string) {
  if (scope.kind === "none") {
    return eq(resumePoolItem.id, "__none__");
  }
  return and(
    eq(resumePoolItem.organizationId, organizationId),
    scope.kind === "restricted"
      ? or(eq(resumePoolItem.scope, "public"), inArray(resumePoolItem.createdBy, scope.userIds))
      : undefined,
  );
}

function proposalId(input: z.infer<typeof proposalInputSchema>) {
  if (input.type === "bind_candidate_to_job") {
    const id = z.string().safeParse(input.payload.resumeRecordId);
    if (id.success) {
      return `conversation-bind:resume_record:${id.data}`;
    }
  }
  if (input.type === "bind_pool_item_to_job") {
    const id = z.string().safeParse(input.payload.poolItemId);
    if (id.success) {
      return `conversation-bind:resume_pool_item:${id.data.replace(/^pool:/u, "")}`;
    }
  }
  return crypto.randomUUID();
}

function buildInstructions(focus?: RecruitingCopilotFocus) {
  const focusText = focus
    ? `\n当前界面聚焦的招聘台候选人 id 是「${focus.id}」。用户说“这个候选人”时，先调用 get_resume_record_detail 读取该记录。`
    : "";
  return `你是 Workspace Recruiting Copilot，服务当前工作区的招聘人员。

只能依据工具返回的当前 workspace 数据回答；涉及候选人或岗位事实时必须先调用只读工具，并在回答中明确引用记录。不要输出读取过程旁白。
支持自然语言检索候选人、读取招聘台或人才库详情、岗位检索、候选人比较和岗位匹配解释。单次最多比较 5 人。
未绑定岗位时，可基于简历全文给出明确标注为临时分析的 Markdown 评价；没有岗位标准时不要给分。用户明确同意绑定后才能提出 bind 动作。
任何写操作都只能调用 propose_recruiting_action 生成待确认卡，不能直接修改业务数据。候选人绑定只影响本对话上下文。
回答使用简体中文，简洁且可核验。${focusText}`;
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

export function createRecruitingCopilotTools(input: {
  bindingConsent: boolean;
  contextBindings: ChatContextBindings;
  database: WorkspaceDatabasePort;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}) {
  const { contextBindings, database, organizationId, visibilityScope } = input;
  return {
    get_job_description_detail: createTool({
      description: "批量读取当前 workspace 最多 5 个在招岗位的完整 JD。",
      execute: async ({ ids }: z.infer<typeof idsInputSchema>) => {
        const records = await database
          .select({
            code: jobDescription.code,
            description: jobDescription.description,
            id: jobDescription.id,
            name: jobDescription.name,
            prompt: jobDescription.prompt,
          })
          .from(jobDescription)
          .where(
            and(
              eq(jobDescription.organizationId, organizationId),
              eq(jobDescription.lifecycleStatus, "published"),
              inArray(jobDescription.id, ids),
            ),
          );
        return {
          citations: records.map((record) => ({
            id: record.id,
            label: record.name,
            recordType: "job_description" as const,
            secondaryLabel: record.code,
          })),
          jobDescriptions: records,
          missingIds: ids.filter((id) => !records.some((record) => record.id === id)),
        };
      },
      id: "get_job_description_detail",
      inputSchema: idsInputSchema,
    }),
    get_resume_pool_detail: createTool({
      description: "批量读取最多 5 个人才库条目；需要评价时设置 includeResumeText=true。",
      execute: async ({ requests }: z.infer<typeof detailRequestsInputSchema>) => {
        const ids = requests.map((request) => request.id.replace(/^pool:/u, ""));
        const records = await database
          .select({
            candidateName: resumePoolItem.candidateName,
            id: resumePoolItem.id,
            jobDescriptionId: resumePoolItem.jobDescriptionId,
            notes: resumePoolItem.notes,
            resumeParseStatus: resumePoolItem.resumeParseStatus,
            resumeProfile: resumePoolItem.resumeProfile,
            resumeText: resumePoolItem.resumeText,
            scope: resumePoolItem.scope,
            skills: resumePoolItem.skillsNormalized,
            targetRole: resumePoolItem.targetRole,
          })
          .from(resumePoolItem)
          .where(
            and(
              inArray(resumePoolItem.id, ids),
              poolVisibilityCondition(visibilityScope, organizationId),
            ),
          );
        return {
          missingIds: ids.filter((id) => !records.some((record) => record.id === id)),
          resumePoolItems: records.map((record) => {
            const request = requests.find(
              (candidate) => candidate.id.replace(/^pool:/u, "") === record.id,
            );
            return {
              candidateName: record.candidateName,
              citation: {
                id: `pool:${record.id}`,
                label: record.candidateName,
                recordType: "resume_pool_item" as const,
                secondaryLabel: clean(record.targetRole),
              },
              hasAiProfile: record.resumeProfile !== null,
              id: record.id,
              jobDescriptionId:
                contextBindings.resume_pool_item?.[record.id] ?? record.jobDescriptionId,
              keySkills: record.skills.slice(0, 8),
              notes: clean(record.notes),
              resumeParseStatus: record.resumeParseStatus,
              resumeProfile: record.resumeProfile,
              resumeText: request?.includeResumeText
                ? (record.resumeText?.slice(0, 12_000) ?? null)
                : null,
              scope: record.scope,
              targetRole: clean(record.targetRole),
            };
          }),
        };
      },
      id: "get_resume_pool_detail",
      inputSchema: detailRequestsInputSchema,
    }),
    get_resume_record_detail: createTool({
      description: "批量读取最多 5 个招聘台候选人的简历、岗位绑定及已有评价。",
      execute: async ({ requests }: z.infer<typeof detailRequestsInputSchema>) => {
        const ids = requests.map((request) => request.id);
        const records = await database
          .select({
            candidateName: studioInterview.candidateName,
            id: studioInterview.id,
            interviewQuestions: studioInterview.interviewQuestions,
            jobDescriptionId: studioInterview.jobDescriptionId,
            notes: studioInterview.notes,
            pipelineStage: studioInterview.pipelineStage,
            qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
            resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
            resumeProfile: studioInterview.resumeProfile,
            resumeReview: studioInterview.resumeReview,
            resumeReviewError: studioInterview.resumeReviewError,
            resumeReviewStatus: studioInterview.resumeReviewStatus,
            resumeText: studioInterview.resumeText,
            structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
            targetRole: studioInterview.targetRole,
          })
          .from(studioInterview)
          .where(
            and(
              eq(studioInterview.organizationId, organizationId),
              inArray(studioInterview.id, ids),
              visibilityCondition(visibilityScope),
            ),
          );
        return {
          missingIds: ids.filter((id) => !records.some((record) => record.id === id)),
          resumeRecords: records.map((record) => {
            const request = requests.find((candidate) => candidate.id === record.id);
            return {
              ...record,
              citation: {
                id: record.id,
                label: record.candidateName,
                recordType: "resume_record" as const,
                secondaryLabel: clean(record.targetRole),
              },
              jobDescriptionId:
                contextBindings.resume_record?.[record.id] ?? record.jobDescriptionId,
              notes: clean(record.notes),
              resumeText: request?.includeResumeText
                ? (record.resumeText?.slice(0, 12_000) ?? null)
                : null,
              targetRole: clean(record.targetRole),
            };
          }),
        };
      },
      id: "get_resume_record_detail",
      inputSchema: detailRequestsInputSchema,
    }),
    propose_recruiting_action: createTool({
      description: "生成需要用户批准的招聘动作卡；工具本身不直接修改招聘数据。",
      execute: (proposal: z.infer<typeof proposalInputSchema>) => {
        const id = proposalId(proposal);
        const confirmation = contextBindings.actionConfirmations?.[id];
        const result = { proposal: { ...proposal, id } };
        return Promise.resolve(confirmation ? { ...result, confirmation } : result);
      },
      id: "propose_recruiting_action",
      inputSchema: input.bindingConsent ? proposalInputSchema : nonBindingProposalInputSchema,
      outputSchema: proposalOutputSchema,
      requireApproval: true,
    }),
    search_job_descriptions: createTool({
      description: "检索当前 workspace 的在招岗位，返回岗位摘要和引用。",
      execute: async ({ limit = 5, query }: z.infer<typeof searchInputSchema>) => {
        const records = await database
          .select({
            code: jobDescription.code,
            description: jobDescription.description,
            id: jobDescription.id,
            name: jobDescription.name,
            prompt: jobDescription.prompt,
          })
          .from(jobDescription)
          .where(
            and(
              eq(jobDescription.organizationId, organizationId),
              eq(jobDescription.lifecycleStatus, "published"),
              query
                ? or(
                    ilike(jobDescription.name, `%${query}%`),
                    ilike(jobDescription.prompt, `%${query}%`),
                    ilike(jobDescription.code, `%${query}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(jobDescription.updatedAt))
          .limit(limit);
        return {
          citations: records.map((record) => ({
            id: record.id,
            label: record.name,
            recordType: "job_description" as const,
            secondaryLabel: record.code,
          })),
          jobDescriptions: records,
        };
      },
      id: "search_job_descriptions",
      inputSchema: searchInputSchema,
    }),
    search_resume_records: createTool({
      description: "检索招聘台候选人摘要；需要详情或评价时继续调用详情工具。",
      execute: async ({ limit = 5, query }: z.infer<typeof searchInputSchema>) => {
        const records = await database
          .select({
            candidateName: studioInterview.candidateName,
            id: studioInterview.id,
            jobDescriptionId: studioInterview.jobDescriptionId,
            notes: studioInterview.notes,
            pipelineStage: studioInterview.pipelineStage,
            resumeFileName: studioInterview.resumeFileName,
            skills: studioInterview.skillsNormalized,
            targetRole: studioInterview.targetRole,
            updatedAt: studioInterview.updatedAt,
          })
          .from(studioInterview)
          .where(
            and(
              eq(studioInterview.organizationId, organizationId),
              visibilityCondition(visibilityScope),
              query
                ? or(
                    ilike(studioInterview.candidateName, `%${query}%`),
                    ilike(studioInterview.searchText, `%${query}%`),
                    ilike(studioInterview.targetRole, `%${query}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(studioInterview.updatedAt))
          .limit(limit);
        return {
          candidateSummaryCards: records.map((record) => ({
            candidateName: record.candidateName,
            hasResumeFile: Boolean(record.resumeFileName),
            id: record.id,
            jobDescriptionId: contextBindings.resume_record?.[record.id] ?? record.jobDescriptionId,
            keySkills: record.skills.slice(0, 8),
            notes: clean(record.notes),
            pipelineStage: record.pipelineStage,
            resumeFileName: record.resumeFileName,
            targetRole: clean(record.targetRole),
            updatedAt: record.updatedAt.toISOString(),
          })),
          citations: records.map((record) => ({
            id: record.id,
            label: record.candidateName,
            recordType: "resume_record" as const,
            secondaryLabel: clean(record.targetRole),
          })),
          retrievalMode: query ? "structured_text" : "structured",
          semanticHitCount: 0,
          total: records.length,
        };
      },
      id: "search_resume_records",
      inputSchema: searchInputSchema,
    }),
  };
}

function modelConfig() {
  const modelId =
    rawBackendEnvironment.MASTRA_FAST_MODEL?.trim() ||
    rawBackendEnvironment.ALIBABA_FAST_MODEL?.trim() ||
    rawBackendEnvironment.ALIBABA_MODEL?.trim() ||
    "deepseek-v4-flash-0731";
  return {
    apiKey: rawBackendEnvironment.ALIBABA_API_KEY,
    modelId: modelId.replace(/^alibaba-coding-plan\//u, ""),
    providerId: "alibaba",
    url:
      rawBackendEnvironment.ALIBABA_BASE_URL?.trim() ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
}

let mastraSingleton: Mastra | undefined;
let mastraStorageClosePromise: Promise<void> | undefined;
let mastraStorageSingleton: PostgresStore | undefined;

export async function closeRecruitingMastraStorage(): Promise<void> {
  if (mastraStorageClosePromise) {
    await mastraStorageClosePromise;
    return;
  }

  const storage = mastraStorageSingleton;
  mastraSingleton = undefined;
  mastraStorageSingleton = undefined;

  if (!storage) {
    return;
  }

  mastraStorageClosePromise = storage.close();
  try {
    await mastraStorageClosePromise;
  } finally {
    mastraStorageClosePromise = undefined;
  }
}

export function getRecruitingMastra() {
  if (!mastraSingleton) {
    const connectionString = rawBackendEnvironment.DATABASE_URL?.trim();
    mastraStorageSingleton = connectionString
      ? new PostgresStore({
          connectionString,
          id: "arc-backend-mastra-storage",
          schemaName: rawBackendEnvironment.MASTRA_POSTGRES_SCHEMA?.trim() || "mastra",
        })
      : undefined;
    mastraSingleton = new Mastra(
      mastraStorageSingleton
        ? {
            storage: mastraStorageSingleton,
          }
        : {},
    );
  }
  return mastraSingleton;
}

export function createRecruitingCopilotAgent(input: {
  bindingConsent: boolean;
  contextBindings: ChatContextBindings;
  database: WorkspaceDatabasePort;
  focus?: RecruitingCopilotFocus;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}) {
  return new Agent({
    id: "recruiting-copilot-agent",
    instructions: buildInstructions(input.focus),
    maxRetries: 1,
    model: [
      {
        model: modelConfig(),
        modelSettings: { reasoning: "none" },
        providerOptions: { alibaba: { enable_thinking: false } },
      },
    ],
    name: "RecruitingCopilotAgent",
    tools: createRecruitingCopilotTools(input),
  });
}
