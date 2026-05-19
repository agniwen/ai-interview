import { z } from "zod";

export const ROUND_EMAIL_LOG_STATUSES = ["sent", "failed"] as const;
export type RoundEmailLogStatus = (typeof ROUND_EMAIL_LOG_STATUSES)[number];

export interface RoundEmailSummary {
  count: number;
  lastSentAt: string | null;
  lastStatus: RoundEmailLogStatus | null;
}

export type RoundEmailSummaryMap = Record<string, RoundEmailSummary>;

export const sendRoundEmailParamsSchema = z.object({
  roundId: z.string().min(1, "缺少 roundId"),
});

export const summaryQuerySchema = z.object({
  roundIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(",")))
    .pipe(z.array(z.string().min(1)).min(1, "至少传一个 roundId").max(200)),
});

export interface SendRoundEmailResponse {
  logId: string;
  sentAt: string;
  toEmail: string;
}
