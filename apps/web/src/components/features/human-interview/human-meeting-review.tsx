"use client";

import { IconLoader2, IconSparkles } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import {
  humanInterviewEvaluationRatingSchema,
  humanInterviewRoundOutcomeSchema,
} from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewEvaluation,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_EVALUATION: HumanInterviewEvaluation = {
  detailedAnalysis: "",
  evidenceTurnIds: [],
  overallEvaluation: "",
  professionalSkill: "",
  rating: "B",
  risks: "",
  rolePosition: "",
  salaryRecommendation: "",
  seniorityPosition: "",
  strengths: "",
};

type EvaluationTextFieldKey =
  | "detailedAnalysis"
  | "overallEvaluation"
  | "professionalSkill"
  | "risks"
  | "rolePosition"
  | "salaryRecommendation"
  | "seniorityPosition"
  | "strengths";

const EVALUATION_TEXT_FIELDS: { key: EvaluationTextFieldKey; label: string }[] = [
  { key: "professionalSkill", label: "专业技能" },
  { key: "seniorityPosition", label: "职级定位" },
  { key: "rolePosition", label: "角色定位" },
  { key: "strengths", label: "优势特点" },
  { key: "risks", label: "劣势风险" },
  { key: "salaryRecommendation", label: "薪资建议" },
  { key: "overallEvaluation", label: "整体评价" },
  { key: "detailedAnalysis", label: "完整详细分析" },
];

const OUTCOME_LABELS = {
  fail: "未通过",
  inconclusive: "待定",
  pass: "通过",
} as const satisfies Record<HumanInterviewRoundOutcome, string>;

const errorResponseSchema = z.object({ error: z.string() });
const jsonBodySchema = z.json();
type JsonBody = z.infer<typeof jsonBodySchema>;

function Field({
  children,
  label,
  wide = false,
}: {
  children: ReactNode;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "space-y-2 md:col-span-2" : "space-y-2"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function describeEvaluationStatus(
  review: HumanInterviewReviewRecord,
  isSubmitted: boolean,
  submittedOutcomeLabel: string,
): string {
  if (isSubmitted) {
    return `本轮评价已保存 · ${submittedOutcomeLabel}`;
  }
  if (review.evaluationStatus === "generating") {
    return "正在整理会议内容并生成评价…";
  }
  if (!review.transcript) {
    return review.transcriptionState === "failed"
      ? "会议内容整理失败，暂时无法生成评价"
      : "正在整理会议内容并生成评价…";
  }
  return review.evaluationError || "AI 草稿可由面试官修改后保存";
}

async function requestJson<TResult>(path: string, init?: RequestInit): Promise<TResult> {
  const response = await fetch(path, init);
  let body: JsonBody = null;
  try {
    body = jsonBodySchema.parse(await response.json());
  } catch {
    body = null;
  }
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    const message = parsed.success ? parsed.data.error : "操作失败，请稍后重试。";
    throw new Error(message);
  }
  // SAFETY: each caller supplies the shared DTO for its corresponding JSON endpoint.
  return body as TResult;
}

// eslint-disable-next-line complexity -- the review board coordinates AI drafting and final submission states in one form.
export function HumanMeetingReview({
  active,
  inviteToken,
  onClose,
}: {
  active: boolean;
  inviteToken: string;
  onClose: () => void;
}) {
  const basePath = `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}`;
  const [review, setReview] = useState<HumanInterviewReviewRecord | null>(null);
  const [evaluation, setEvaluation] = useState<HumanInterviewEvaluation>(EMPTY_EVALUATION);
  const [outcome, setOutcome] = useState<HumanInterviewRoundOutcome>("inconclusive");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const evaluationDirtyRef = useRef(false);

  const load = useCallback(async () => {
    const next = await requestJson<HumanInterviewReviewRecord>(`${basePath}/review`, {
      cache: "no-store",
    });
    setReview(next);
    if (!evaluationDirtyRef.current) {
      setEvaluation(next.evaluation ?? EMPTY_EVALUATION);
      setOutcome(next.outcome ?? "inconclusive");
    }
  }, [basePath]);

  // oxlint-disable-next-line react/set-state-in-effect -- remote review state is synchronized only while this board is active.
  useEffect(() => {
    if (!active) {
      return;
    }
    let firstLoad = true;
    const refresh = async () => {
      try {
        await load();
      } catch (error) {
        if (firstLoad) {
          toast.error(error instanceof Error ? error.message : "加载复核内容失败");
        }
      } finally {
        firstLoad = false;
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  async function run(name: string, task: () => Promise<void>) {
    setBusy(name);
    try {
      await task();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  if (!review) {
    return (
      <div className="flex h-full items-center justify-center text-white/60 text-sm">
        <IconLoader2 className="mr-2 size-4 animate-spin" />
        加载面试评价…
      </div>
    );
  }

  const isSubmitted = review.evaluationStatus === "submitted" || review.roundStatus === "completed";
  const submittedOutcomeLabel = review.outcome ? OUTCOME_LABELS[review.outcome] : "已完成";

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-4 text-white">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-lg">面试评价</h2>
              <p className="text-white/50 text-xs">
                {describeEvaluationStatus(review, isSubmitted, submittedOutcomeLabel)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isSubmitted && confirmRegenerate ? (
                <>
                  <span className="text-amber-300 text-xs">将覆盖当前草稿</span>
                  <Button
                    disabled={!review.transcript || Boolean(busy)}
                    onClick={async () => {
                      await run("regenerate", async () => {
                        await requestJson<unknown>(`${basePath}/evaluation-regenerate`, {
                          body: JSON.stringify({ confirmOverwrite: true }),
                          headers: { "Content-Type": "application/json" },
                          method: "POST",
                        });
                        setConfirmRegenerate(false);
                        evaluationDirtyRef.current = false;
                        toast.success("已重新提交 AI 评价");
                        await load();
                      });
                    }}
                    size="sm"
                  >
                    确认覆盖
                  </Button>
                  <Button onClick={() => setConfirmRegenerate(false)} size="sm" variant="ghost">
                    取消
                  </Button>
                </>
              ) : null}
              {!isSubmitted && !confirmRegenerate ? (
                <Button
                  disabled={!review.transcript || Boolean(busy)}
                  onClick={() => setConfirmRegenerate(true)}
                  size="sm"
                  variant="outline"
                >
                  <IconSparkles className="size-4" />
                  重新生成
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="评级">
              <select
                className="h-9 w-full rounded-md border border-white/15 bg-zinc-900 px-3 text-sm"
                disabled={isSubmitted}
                onChange={(event) => {
                  const rating = humanInterviewEvaluationRatingSchema.safeParse(event.target.value);
                  if (!rating.success) {
                    return;
                  }
                  evaluationDirtyRef.current = true;
                  setEvaluation((current) => ({
                    ...current,
                    rating: rating.data,
                  }));
                }}
                value={evaluation.rating}
              >
                {humanInterviewEvaluationRatingSchema.options.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </Field>
            {EVALUATION_TEXT_FIELDS.map(({ key, label }) => (
              <Field
                key={key}
                label={label}
                wide={key === "detailedAnalysis" || key === "overallEvaluation"}
              >
                <Textarea
                  className={
                    key === "detailedAnalysis"
                      ? "min-h-56 border-white/15 bg-black/20"
                      : "border-white/15 bg-black/20"
                  }
                  disabled={isSubmitted}
                  onChange={(event) => {
                    evaluationDirtyRef.current = true;
                    setEvaluation((current) => ({ ...current, [key]: event.target.value }));
                  }}
                  value={evaluation[key]}
                />
              </Field>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-white/10 border-t pt-4">
            <Field label="本轮结论">
              <select
                className="h-9 min-w-40 rounded-md border border-white/15 bg-zinc-900 px-3 text-sm"
                disabled={isSubmitted}
                onChange={(event) => {
                  const parsed = humanInterviewRoundOutcomeSchema.safeParse(event.target.value);
                  if (parsed.success) {
                    evaluationDirtyRef.current = true;
                    setOutcome(parsed.data);
                  }
                }}
                value={outcome}
              >
                <option value="pass">通过</option>
                <option value="inconclusive">待定</option>
                <option value="fail">未通过</option>
              </select>
            </Field>
            {isSubmitted ? (
              <div className="flex items-center gap-2">
                <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 font-medium text-emerald-300 text-sm">
                  本轮评价已保存 · {submittedOutcomeLabel}
                </div>
                <Button
                  className="border-white/30 bg-white/5 hover:bg-white/10"
                  disabled={Boolean(busy)}
                  onClick={onClose}
                  variant="outline"
                >
                  关闭
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  disabled={Boolean(busy) || !evaluation.overallEvaluation.trim()}
                  onClick={async () => {
                    const transcriptRevisionId = review.transcript?.id ?? null;
                    await run("save", async () => {
                      await requestJson<unknown>(`${basePath}/evaluation-draft`, {
                        body: JSON.stringify({
                          evaluation,
                          transcriptRevisionId,
                        }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                      });
                      evaluationDirtyRef.current = false;
                      toast.success("评价草稿已保存");
                      await load();
                    });
                  }}
                  variant="outline"
                >
                  保存
                </Button>
                <Button
                  disabled={Boolean(busy) || !evaluation.overallEvaluation.trim()}
                  onClick={async () => {
                    const transcriptRevisionId = review.transcript?.id ?? null;
                    await run("submit", async () => {
                      await requestJson<unknown>(`${basePath}/evaluation-submit`, {
                        body: JSON.stringify({
                          evaluation,
                          outcome,
                          transcriptRevisionId,
                        }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                      });
                      evaluationDirtyRef.current = false;
                      toast.success("本轮评价已提交并同步到面试轮次");
                      await load();
                    });
                  }}
                >
                  提交
                </Button>
                <Button
                  className="border-white/30 bg-white/5 hover:bg-white/10"
                  disabled={Boolean(busy)}
                  onClick={onClose}
                  variant="outline"
                >
                  关闭
                </Button>
              </div>
            )}
          </div>
          {isSubmitted && review.documentSync ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/60">
              <span>
                {
                  (
                    {
                      failed: "飞书评价表同步失败，将自动重试；请确认文档访问权限",
                      pending: "飞书评价表待同步",
                      synced: "已同步到飞书评价表",
                      syncing: "正在同步飞书评价表…",
                      waiting_document: "暂无飞书评价表，生成后将自动同步",
                    } as const
                  )[review.documentSync.status]
                }
              </span>
              {review.documentSync.status === "synced" && review.documentSync.documentUrl ? (
                <a
                  className="text-blue-300 underline"
                  href={review.documentSync.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看评价表
                </a>
              ) : null}
              {review.documentSync.status === "failed" ||
              review.documentSync.status === "waiting_document" ? (
                <Button
                  disabled={Boolean(busy)}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run("sync", async () => {
                      await requestJson(`${basePath}/evaluation-document-retry`, {
                        method: "POST",
                      });
                      await load();
                      toast.success("已安排重新同步评价表");
                    })
                  }
                >
                  重试同步
                </Button>
              ) : null}
            </div>
          ) : null}
          {review.evaluationStatus === "generating" ? (
            <p className="mt-3 text-right text-white/50 text-xs leading-5">
              AI
              评价生成可能需要一些时间，你可以先关闭此页面。生成完成后，我们会通过飞书发送评价链接，请返回审核并提交最终评价。
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
