import { z } from "zod";
import type { ResumeAnalysisResult, ResumeProfile } from "@/lib/shared/interview/types";
import type { StudioInterviewStatus } from "@/lib/shared/studio-interviews";

/**
 * 简历库列表行 DTO。AI 面试列表的精简投影：去掉 status / interviewQuestions /
 * scheduleEntries 等面试态字段，只保留候选人 / 简历 / 创建者维度。
 *
 * Resume library list row. A trimmed projection of the interview list — interview
 * status, generated questions and schedule entries are intentionally dropped so
 * the resume library view stays focused on candidate + resume metadata.
 */
export interface ResumeLibraryListRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  notes: string | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  resumeContentHash: string | null;
  hasResumeFile: boolean;
  // 是否已存在至少一个 AI 面试轮次（studioInterviewSchedule）。
  // Whether this candidate already has at least one AI interview round.
  hasInterviewRounds: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  creatorName: string | null;
  creatorOrganizationName: string | null;
}

/**
 * 单条详情 DTO：列表字段 + resumeProfile 结构化简历 + interviewQuestions。
 *
 * Detail DTO: list fields plus the structured `resumeProfile` and any
 * `interviewQuestions` generated during upload (may be empty for legacy rows).
 */
export interface ResumeLibraryDetail extends ResumeLibraryListRecord {
  resumeProfile: ResumeProfile | null;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
}

export interface PaginatedResumeLibraryResult {
  records: ResumeLibraryListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 表单 schema（创建 / 编辑共用）。比 studioInterviewFormSchema 宽松：
 *   - 不要求至少一轮 scheduleEntries
 *   - 不要求 jobDescriptionId
 *   - 不需要 status（始终 draft）
 * 候选人姓名可空：服务端会用解析结果回填，最终落库时强制非空（兜底"未命名候选人"）。
 *
 * Create / edit form schema. Looser than `studioInterviewFormSchema`:
 *   - no schedule entries required
 *   - jobDescription is optional
 *   - no status field (always draft)
 * `candidateName` may be empty — the server falls back to the parsed profile
 * name (and finally "未命名候选人" if the resume has no name either).
 */
export const resumeLibraryFormSchema = z.object({
  candidateEmail: z
    .string()
    .trim()
    .max(200, "邮箱不能超过 200 个字符")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "请输入有效邮箱",
    }),
  candidateName: z.string().trim().max(120, "候选人姓名不能超过 120 个字符"),
  candidatePhone: z.string().trim().max(40, "联系电话不能超过 40 个字符"),
  jobDescriptionId: z.string().trim().max(100),
  notes: z.string().trim().max(2000, "备注不能超过 2000 字"),
  targetRole: z.string().trim().max(120, "目标岗位不能超过 120 个字符"),
});

export type ResumeLibraryFormValues = z.infer<typeof resumeLibraryFormSchema>;

export function createResumeLibraryFormValues(): ResumeLibraryFormValues {
  return {
    candidateEmail: "",
    candidateName: "",
    candidatePhone: "",
    jobDescriptionId: "",
    notes: "",
    targetRole: "",
  };
}

/**
 * 简历库页头部 chart 的聚合数据。
 * - byStatus：各状态简历数量；archived 排除（详见 DAO 注释）。
 * - dailyAdded：近 30 天每日新增；服务端只返回有数据的日期，零填充由客户端补。
 * - conversion：是否已发起 AI 面试的对比（archived 排除）。
 *
 * Aggregations for the charts shown above the resume-library table.
 * - byStatus: count per status (archived excluded — see DAO).
 * - dailyAdded: daily new rows over the last 30 days; only non-empty days are
 *   returned, the client zero-fills the gaps.
 * - conversion: how many candidates have already launched an AI interview
 *   round vs not (archived excluded).
 */
export interface ResumeLibraryMetrics {
  byStatus: { status: StudioInterviewStatus; count: number }[];
  dailyAdded: { day: string; count: number }[];
  conversion: { withInterview: number; withoutInterview: number };
}
