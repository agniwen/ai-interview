import type { InterviewScheduleEntry } from "@/lib/interview/interview-record";
import type { ResumeAnalysisResult } from "@/lib/interview/types";
import { z } from "zod";

export const studioInterviewStatusValues = [
  "draft",
  "ready",
  "in_progress",
  "completed",
  "archived",
] as const;

export const studioInterviewStatusSchema = z.enum(studioInterviewStatusValues);

export const scheduleEntryStatusValues = ["pending", "in_progress", "completed"] as const;

export const scheduleEntryStatusSchema = z.enum(scheduleEntryStatusValues);

export type ScheduleEntryStatus = z.infer<typeof scheduleEntryStatusSchema>;

export const scheduleEntryStatusMeta: Record<
  ScheduleEntryStatus,
  { label: string; tone: "default" | "secondary" | "outline" }
> = {
  completed: { label: "已结束", tone: "default" },
  in_progress: { label: "进行中", tone: "secondary" },
  pending: { label: "待开始", tone: "outline" },
};

export const studioInterviewScheduleEntrySchema = z.object({
  id: z.string().trim().optional(),
  notes: z.string().trim().max(1000, "轮次备注不能超过 1000 字").optional().or(z.literal("")),
  roundLabel: z.string().trim().min(1, "请输入面试轮次").max(100, "面试轮次不能超过 100 个字符"),
  scheduledAt: z.string().trim().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0),
});

export const studioInterviewBaseSchema = z.object({
  candidateEmail: z.string().trim().email("请输入有效邮箱").or(z.literal("")),
  candidateName: z
    .string()
    .trim()
    .min(1, "请输入候选人姓名")
    .max(120, "候选人姓名不能超过 120 个字符"),
  jobDescriptionId: z.string().trim().min(1, "请选择在招岗位"),
  notes: z.string().trim().max(2000, "备注不能超过 2000 字"),
  scheduleEntries: z
    .array(studioInterviewScheduleEntrySchema)
    .min(1, "至少添加一轮面试安排")
    .superRefine((entries, context) => {
      const seenOrder = new Set<number>();

      for (const entry of entries) {
        if (seenOrder.has(entry.sortOrder)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "面试轮次顺序不能重复",
          });
          return;
        }

        seenOrder.add(entry.sortOrder);

        if (entry.scheduledAt && Number.isNaN(Date.parse(entry.scheduledAt))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "请输入有效的面试时间",
          });
          return;
        }
      }
    }),
  status: studioInterviewStatusSchema,
  targetRole: z.string().trim().max(120, "目标岗位不能超过 120 个字符"),
});

export const studioInterviewFormSchema = studioInterviewBaseSchema;
export const studioInterviewUpdateSchema = studioInterviewBaseSchema;

export const studioInterviewResumePayloadSchema = z.object({
  fileName: z.string().trim().min(1),
  interviewQuestions: z.custom<ResumeAnalysisResult["interviewQuestions"]>(),
  resumeProfile: z.custom<ResumeAnalysisResult["resumeProfile"]>(),
});

export type StudioInterviewStatus = z.infer<typeof studioInterviewStatusSchema>;
export type StudioInterviewScheduleEntryFormValue = z.infer<
  typeof studioInterviewScheduleEntrySchema
>;
export type StudioInterviewFormValues = z.infer<typeof studioInterviewFormSchema>;
export type StudioInterviewUpdateValues = z.infer<typeof studioInterviewUpdateSchema>;

export interface StudioInterviewRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  targetRole: string | null;
  status: StudioInterviewStatus;
  resumeFileName: string | null;
  resumeProfile: ResumeAnalysisResult["resumeProfile"] | null;
  resumeStorageKey: string | null;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
  scheduleEntries: InterviewScheduleEntry[];
  interviewLink: string;
  jobDescriptionId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type StudioInterviewListRecord = Omit<
  StudioInterviewRecord,
  "resumeProfile" | "interviewQuestions" | "resumeStorageKey"
> & {
  questionCount: number;
  hasResumeFile: boolean;
};

export function toStudioInterviewListRecord(
  record: StudioInterviewRecord,
): StudioInterviewListRecord {
  return {
    candidateEmail: record.candidateEmail,
    candidateName: record.candidateName,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    hasResumeFile: Boolean(record.resumeStorageKey),
    id: record.id,
    interviewLink: record.interviewLink,
    jobDescriptionId: record.jobDescriptionId,
    notes: record.notes,
    questionCount: record.interviewQuestions.length,
    resumeFileName: record.resumeFileName,
    scheduleEntries: record.scheduleEntries,
    status: record.status,
    targetRole: record.targetRole,
    updatedAt: record.updatedAt,
  };
}

export const studioInterviewStatusMeta: Record<
  StudioInterviewStatus,
  { label: string; tone: "default" | "secondary" | "outline" }
> = {
  archived: { label: "已归档", tone: "outline" },
  completed: { label: "已完成", tone: "secondary" },
  draft: { label: "草稿", tone: "outline" },
  in_progress: { label: "进行中", tone: "secondary" },
  ready: { label: "待面试", tone: "default" },
};

export function createDefaultScheduleEntry(sortOrder = 0): StudioInterviewScheduleEntryFormValue {
  return {
    notes: "",
    roundLabel: sortOrder === 0 ? "一面" : `第 ${sortOrder + 1} 轮`,
    scheduledAt: "",
    sortOrder,
  };
}

export function toNullableString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function parseScheduleEntriesInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  return studioInterviewScheduleEntrySchema.array().parse(parsed);
}

export function parseResumePayloadInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;
  return studioInterviewResumePayloadSchema.parse(parsed);
}

export function getScheduleEntryDateValue(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return formatter.format(date).replace(" ", "T");
}
