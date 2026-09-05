"use client";

import { IconLoader2, IconSparkles } from "@tabler/icons-react";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { Field as FormField, FieldGroup, FieldLabel } from "@/components/ui/field";
import { cn } from "@app/shared/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HumanMeetingTranscriptRecovery } from "./human-meeting-transcript-recovery";

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
  fail: "不通过",
  inconclusive: "待定",
  pass: "通过",
} as const satisfies Record<HumanInterviewRoundOutcome, string>;

const errorResponseSchema = z.object({ error: z.string() });
const jsonBodySchema = z.json();
type JsonBody = z.infer<typeof jsonBodySchema>;

function Field({
  children,
  label,
  id,
  wide = false,
}: {
  children: ReactNode;
  label: string;
  id: string;
  wide?: boolean;
}) {
  return (
    <FormField className={cn("gap-2", wide && "md:col-span-2")}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </FormField>
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
      ? "会议内容整理失败，仍可手动填写并提交评价"
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

type ReviewProps = {
  active: boolean;
  onClose: () => void;
  onSaved?: () => void;
  renderShell?: (content: ReactNode, requestClose: () => void) => ReactNode;
} & ({ inviteToken: string; basePath?: never } | { basePath: string; inviteToken?: never });

// eslint-disable-next-line complexity -- one review form serves both authenticated and invitation entrypoints.
function HumanMeetingReviewForm({
  active,
  basePath,
  onClose,
  onSaved,
  renderShell,
}: {
  active: boolean;
  basePath: string;
  onClose: () => void;
  onSaved?: () => void;
  renderShell?: ReviewProps["renderShell"];
}) {
  const fieldId = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [review, setReview] = useState<HumanInterviewReviewRecord | null>(null);
  const [evaluation, setEvaluation] = useState<HumanInterviewEvaluation>(EMPTY_EVALUATION);
  const [outcome, setOutcome] = useState<HumanInterviewRoundOutcome | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const evaluationDirtyRef = useRef(false);
  const hasUnsavedChanges = useCallback(() => evaluationDirtyRef.current, []);
  const navigationBlocker = useBlocker({
    disabled: !active,
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: hasUnsavedChanges,
    withResolver: true,
  });

  const load = useCallback(async () => {
    const next = await requestJson<HumanInterviewReviewRecord>(`${basePath}/review`, {
      cache: "no-store",
    });
    setReview(next);
    setLoadError(null);
    if (!evaluationDirtyRef.current) {
      setEvaluation(next.evaluation ?? EMPTY_EVALUATION);
      setOutcome(
        next.outcome === "inconclusive" && next.roundStatus !== "completed"
          ? ""
          : (next.outcome ?? ""),
      );
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
          setLoadError(error instanceof Error ? error.message : "加载复核内容失败");
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

  const requestClose = useCallback(() => {
    if (busy) {
      return;
    }
    if (evaluationDirtyRef.current) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }, [busy, onClose]);

  function continueEditing() {
    setConfirmDiscard(false);
    navigationBlocker.reset?.();
  }

  function wrap(content: ReactNode) {
    const shell = renderShell ? (
      renderShell(content, requestClose)
    ) : (
      <div className="dark h-full overflow-y-auto bg-background p-4 text-foreground">
        <div className="mx-auto max-w-5xl">{content}</div>
      </div>
    );
    return (
      <>
        {shell}
        <AlertDialog
          open={confirmDiscard || navigationBlocker.status === "blocked"}
          onOpenChange={(open) => {
            if (!open) {
              continueEditing();
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
              <AlertDialogDescription>
                修改尚未保存，关闭后将丢失。可以返回继续编辑或先保存。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={continueEditing}>
                继续编辑
              </Button>
              <Button
                disabled={Boolean(busy)}
                variant="destructive"
                onClick={() => {
                  evaluationDirtyRef.current = false;
                  setConfirmDiscard(false);
                  if (navigationBlocker.status === "blocked") {
                    navigationBlocker.proceed();
                  } else {
                    onClose();
                  }
                }}
              >
                放弃修改并关闭
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (!review) {
    return wrap(
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-muted-foreground text-sm">
        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : (
          <>
            <IconLoader2 className="size-4 animate-spin" />
            加载面试评价…
          </>
        )}
        {loadError ? (
          <Button variant="outline" onClick={() => run("reload", load)}>
            重试
          </Button>
        ) : null}
        <Button variant="outline" onClick={requestClose}>
          关闭
        </Button>
      </div>,
    );
  }

  const isSubmitted = review.evaluationStatus === "submitted" || review.roundStatus === "completed";
  const submittedOutcomeLabel = review.outcome ? OUTCOME_LABELS[review.outcome] : "已完成";

  return wrap(
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card text-card-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-lg">面试评价</h2>
            <p className="text-muted-foreground text-xs">
              {describeEvaluationStatus(review, isSubmitted, submittedOutcomeLabel)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isSubmitted && confirmRegenerate ? (
              <>
                <span className="text-muted-foreground text-xs">将覆盖当前草稿</span>
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
        <FieldGroup className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="评级" id={`${fieldId}-rating`}>
            <select
              id={`${fieldId}-rating`}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={isSubmitted || Boolean(busy)}
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
              id={`${fieldId}-${key}`}
              label={label}
              wide={key === "detailedAnalysis" || key === "overallEvaluation"}
            >
              <Textarea
                id={`${fieldId}-${key}`}
                className={cn(key === "detailedAnalysis" && "min-h-56")}
                disabled={isSubmitted || Boolean(busy)}
                onChange={(event) => {
                  evaluationDirtyRef.current = true;
                  setEvaluation((current) => ({ ...current, [key]: event.target.value }));
                }}
                value={evaluation[key]}
              />
            </Field>
          ))}
        </FieldGroup>
        {isSubmitted && review.documentSync ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
                className="text-primary underline"
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
        {review.recordingNotice || review.transcriptionError ? (
          <Alert className="mt-4">
            <AlertDescription>
              {review.recordingNotice || review.transcriptionError}
            </AlertDescription>
          </Alert>
        ) : null}
        {review.transcript ? (
          <HumanMeetingTranscriptRecovery
            key={review.transcript.id}
            transcript={review.transcript}
            basePath={basePath}
            disabled={Boolean(busy)}
            onUpdated={load}
          />
        ) : null}
        {review.evaluationStatus === "generating" ? (
          <p className="mt-3 text-right text-muted-foreground text-xs leading-5">
            AI
            评价生成可能需要一些时间，你可以先关闭评价。生成完成后，我们会通过飞书发送评价链接，请返回审核并提交最终评价。
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-t bg-card p-4">
        <Field label="本轮结论" id={`${fieldId}-outcome`}>
          <select
            id={`${fieldId}-outcome`}
            className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm"
            disabled={isSubmitted || Boolean(busy)}
            onChange={(event) => {
              const parsed = humanInterviewRoundOutcomeSchema.safeParse(event.target.value);
              if (parsed.success) {
                evaluationDirtyRef.current = true;
                setOutcome(parsed.data);
              }
            }}
            value={outcome}
          >
            <option disabled value="">
              请选择通过或不通过
            </option>
            <option value="pass">通过</option>
            {isSubmitted && outcome === "inconclusive" ? (
              <option value="inconclusive">待定</option>
            ) : null}
            <option value="fail">不通过</option>
          </select>
        </Field>
        {isSubmitted ? (
          <div className="flex items-center gap-2">
            <div className="rounded-md border bg-muted px-4 py-2 font-medium text-sm">
              本轮评价已保存 · {submittedOutcomeLabel}
            </div>
            <Button disabled={Boolean(busy)} onClick={requestClose} variant="outline">
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
                  onSaved?.();
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
                if (outcome !== "pass" && outcome !== "fail") {
                  toast.error("提交前请选择本轮结论：通过或不通过");
                  return;
                }
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
                  onSaved?.();
                  onClose();
                });
              }}
            >
              提交
            </Button>
            <Button disabled={Boolean(busy)} onClick={requestClose} variant="outline">
              关闭
            </Button>
          </div>
        )}
      </div>
    </section>,
  );
}

export function HumanMeetingReview(props: ReviewProps) {
  const basePath =
    props.basePath ??
    `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(props.inviteToken)}`;
  return <HumanMeetingReviewForm key={basePath} {...props} basePath={basePath} />;
}
