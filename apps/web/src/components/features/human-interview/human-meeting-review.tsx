"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useForm, useStore, revalidateLogic } from "@tanstack/react-form";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode, SetStateAction } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import {
  HUMAN_INTERVIEW_EVALUATION_SHORT_TEXT_MAX_LENGTH,
  HUMAN_INTERVIEW_EVALUATION_LONG_TEXT_MAX_LENGTH,
  humanInterviewEvaluationRatingSchema,
  humanInterviewRoundOutcomeSchema,
} from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewEvaluationDraft,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { HumanMeetingReviewSelect } from "./human-meeting-review-select";
import { Field as FormField, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { cn } from "@app/shared/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { LazyMarkdownEditor as MarkdownEditor } from "@/components/features/markdown-editor/lazy-markdown-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HumanMeetingTranscriptRecovery } from "./human-meeting-transcript-recovery";

const EMPTY_EVALUATION: HumanInterviewEvaluationDraft = {
  detailedAnalysis: "",
  evidenceTurnIds: [],
  overallEvaluation: "",
  professionalSkill: "",
  rating: null,
  risks: "",
  rolePosition: "",
  salaryRecommendation: "",
  seniorityPosition: "",
  strengths: "",
};

type EvaluationTextFieldKey =
  | "overallEvaluation"
  | "professionalSkill"
  | "risks"
  | "rolePosition"
  | "salaryRecommendation"
  | "seniorityPosition"
  | "strengths";

const EVALUATION_TEXT_FIELDS: {
  key: EvaluationTextFieldKey;
  label: string;
  minHeight: number;
  placeholder: string;
  wide?: boolean;
}[] = [
  {
    key: "overallEvaluation",
    label: "整体评价",
    minHeight: 104,
    placeholder: "概括岗位匹配情况，并说明主要判断依据",
    wide: true,
  },
  {
    key: "seniorityPosition",
    label: "职级定位",
    minHeight: 48,
    placeholder: "填写职级及依据",
  },
  {
    key: "rolePosition",
    label: "角色定位",
    minHeight: 48,
    placeholder: "填写适合承担的角色",
  },
  {
    key: "salaryRecommendation",
    label: "薪资建议",
    minHeight: 88,
    placeholder: "选填，填写建议薪资范围及依据",
  },
  {
    key: "professionalSkill",
    label: "专业技能",
    minHeight: 88,
    placeholder: "记录面试中体现的专业能力与具体表现",
  },
  { key: "strengths", label: "优势特点", minHeight: 88, placeholder: "记录有具体事例支持的优势" },
  { key: "risks", label: "劣势风险", minHeight: 88, placeholder: "记录能力短板或仍需核实的问题" },
];

const OUTCOME_LABELS = {
  fail: "不通过",
  inconclusive: "待定",
  pass: "通过",
} as const satisfies Record<HumanInterviewRoundOutcome, string>;

const errorResponseSchema = z.object({ error: z.string() });
const jsonBodySchema = z.json();
type JsonBody = z.infer<typeof jsonBodySchema>;

interface ReviewFormValues {
  evaluation: HumanInterviewEvaluationDraft;
  outcome: HumanInterviewRoundOutcome | "";
}

function validateReview({ evaluation, outcome }: ReviewFormValues) {
  const fields: Record<string, string> = {};
  if (outcome !== "pass" && outcome !== "fail") {
    fields.outcome = "请选择本轮结论：通过或不通过";
  }
  if (!humanInterviewEvaluationRatingSchema.safeParse(evaluation.rating).success) {
    fields["evaluation.rating"] = "请选择评级";
  }
  for (const { key, label, wide } of EVALUATION_TEXT_FIELDS) {
    const limit = wide
      ? HUMAN_INTERVIEW_EVALUATION_LONG_TEXT_MAX_LENGTH
      : HUMAN_INTERVIEW_EVALUATION_SHORT_TEXT_MAX_LENGTH;
    if (evaluation[key].trim().length > limit) {
      fields[`evaluation.${key}`] = `${label}最多填写 ${limit.toLocaleString()} 字`;
    }
  }
  return Object.keys(fields).length ? { fields } : undefined;
}

function Field({
  children,
  label,
  id,
  required = false,
  wide = false,
  error,
}: {
  children: ReactNode;
  label: string;
  id: string;
  required?: boolean;
  wide?: boolean;
  error?: string;
}) {
  return (
    <FormField data-invalid={Boolean(error)} className={cn("gap-2", wide && "md:col-span-2")}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      {children}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
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
    return "AI 正在生成评价草稿，可先手动填写";
  }
  if (!review.transcript) {
    return review.transcriptionState === "failed"
      ? "会议内容整理失败，仍可手动填写并提交评价"
      : "正在整理会议内容并生成评价…";
  }
  if (review.evaluationError) {
    return review.evaluationError;
  }
  return review.evaluationStatus === "draft" && review.evaluation?.rating === null
    ? "当前草稿尚未评级，请补充依据并由面试官确认评级后提交"
    : "AI 草稿可由面试官修改后保存";
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

function HumanMeetingReviewShell({
  children,
  renderShell,
  requestClose,
}: {
  children: ReactNode;
  renderShell: ReviewProps["renderShell"];
  requestClose: () => void;
}) {
  return renderShell ? (
    renderShell(children, requestClose)
  ) : (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}

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
  const ratingTriggerRef = useRef<HTMLButtonElement>(null);
  const outcomeTriggerRef = useRef<HTMLButtonElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [review, setReview] = useState<HumanInterviewReviewRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const evaluationDirtyRef = useRef(false);
  const hasUnsavedChanges = useCallback(() => evaluationDirtyRef.current, []);
  const navigationBlocker = useBlocker({
    disabled: !active,
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: hasUnsavedChanges,
    withResolver: true,
  });

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

  const defaultValues: ReviewFormValues = { evaluation: EMPTY_EVALUATION, outcome: "" };
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value: { evaluation, outcome } }) => {
      const transcriptRevisionId = review?.transcript?.id ?? null;
      const { draftOutcome: _draftOutcome, ...submittedEvaluation } = evaluation;
      await run("submit", async () => {
        await requestJson<unknown>(`${basePath}/evaluation-submit`, {
          body: JSON.stringify({
            evaluation: submittedEvaluation,
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
    },
    onSubmitInvalid: ({ value }) => {
      const errors = validateReview(value)?.fields;
      if (errors?.outcome) {
        outcomeTriggerRef.current?.focus();
      } else if (errors?.["evaluation.rating"]) {
        ratingTriggerRef.current?.focus();
      } else {
        const field = EVALUATION_TEXT_FIELDS.find(({ key }) => errors?.[`evaluation.${key}`]);
        if (field) {
          const element = document.querySelector<HTMLElement>(`[id="${fieldId}-${field.key}"]`);
          (element?.querySelector<HTMLElement>('[contenteditable="true"]') ?? element)?.focus();
        }
      }
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: ({ value }) => validateReview(value),
    },
  });
  const evaluation = useStore(form.store, (state) => state.values.evaluation);
  const outcome = useStore(form.store, (state) => state.values.outcome);
  const submissionAttempts = useStore(form.store, (state) => state.submissionAttempts);
  const errors =
    submissionAttempts > 0 ? validateReview({ evaluation, outcome })?.fields : undefined;
  const setEvaluation = useCallback(
    (value: SetStateAction<HumanInterviewEvaluationDraft>) => {
      form.setFieldValue("evaluation", value);
    },
    [form],
  );
  const setOutcome = useCallback(
    (value: HumanInterviewRoundOutcome | "") => {
      form.setFieldValue("outcome", value);
    },
    [form],
  );

  const load = useCallback(async () => {
    const next = await requestJson<HumanInterviewReviewRecord>(`${basePath}/review`, {
      cache: "no-store",
    });
    setReview(next);
    setLoadError(null);
    if (!evaluationDirtyRef.current) {
      setEvaluation(next.evaluation ?? EMPTY_EVALUATION);
      setOutcome(
        next.roundStatus === "completed" || next.evaluationStatus === "submitted"
          ? (next.outcome ?? "")
          : (next.evaluation?.draftOutcome ??
              (next.outcome === "inconclusive" ? "" : (next.outcome ?? ""))),
      );
    }
  }, [basePath, setEvaluation, setOutcome]);

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
    return (
      <>
        <HumanMeetingReviewShell renderShell={renderShell} requestClose={requestClose}>
          {content}
        </HumanMeetingReviewShell>
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-muted-foreground text-sm">
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
      </div>,
    );
  }

  const isSubmitted = review.evaluationStatus === "submitted" || review.roundStatus === "completed";
  const submittedOutcomeLabel = review.outcome ? OUTCOME_LABELS[review.outcome] : "已完成";

  const hasDraftContent = Boolean(
    evaluation.rating ||
    outcome ||
    EVALUATION_TEXT_FIELDS.some(({ key }) => evaluation[key].trim()),
  );

  function renderEditor(
    key: EvaluationTextFieldKey,
    label: string,
    minHeight: number,
    placeholder?: string,
  ) {
    if (key !== "overallEvaluation") {
      return (
        <InputGroup>
          <InputGroupTextarea
            aria-label={label}
            aria-invalid={Boolean(errors?.[`evaluation.${key}`])}
            aria-describedby={`${fieldId}-${key}-count${errors?.[`evaluation.${key}`] ? ` ${fieldId}-${key}-error` : ""}`}
            maxLength={HUMAN_INTERVIEW_EVALUATION_SHORT_TEXT_MAX_LENGTH}
            id={`${fieldId}-${key}`}
            className="field-sizing-fixed resize-none overflow-y-auto"
            rows={4}
            placeholder={placeholder}
            disabled={isSubmitted || Boolean(busy)}
            onChange={(event) => {
              const { value } = event.target;
              evaluationDirtyRef.current = true;
              setEvaluation((current) => ({ ...current, [key]: value }));
            }}
            value={evaluation[key]}
          />
          <InputGroupAddon
            align="block-end"
            className="justify-end pt-0 pb-2 font-normal text-xs tabular-nums"
          >
            <span id={`${fieldId}-${key}-count`}>
              {evaluation[key].length.toLocaleString()} /{" "}
              {HUMAN_INTERVIEW_EVALUATION_SHORT_TEXT_MAX_LENGTH.toLocaleString()}
            </span>
          </InputGroupAddon>
        </InputGroup>
      );
    }
    return (
      <MarkdownEditor
        aria-label={label}
        aria-invalid={Boolean(errors?.[`evaluation.${key}`])}
        id={`${fieldId}-${key}`}
        minHeight={minHeight}
        maxLength={HUMAN_INTERVIEW_EVALUATION_LONG_TEXT_MAX_LENGTH}
        placeholder={placeholder}
        toolbarMode="focus"
        disabled={isSubmitted || Boolean(busy)}
        onChange={(value) => {
          evaluationDirtyRef.current = true;
          setEvaluation((current) => ({ ...current, [key]: value }));
        }}
        value={evaluation[key]}
      />
    );
  }

  return wrap(
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1" scrollFade={!renderShell} scrollbars="never">
        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-lg">面试评价</h2>
              <output className="mt-1 flex items-center gap-2 whitespace-pre-wrap text-muted-foreground text-xs">
                {!isSubmitted && review.evaluationStatus === "generating" ? (
                  <IconLoader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
                ) : null}
                {describeEvaluationStatus(review, isSubmitted, submittedOutcomeLabel)}
              </output>
            </div>
          </div>
          <FieldGroup className="mt-4 grid gap-5 md:grid-cols-2">
            <Field label="本轮结论" id={`${fieldId}-outcome`} required error={errors?.outcome}>
              <HumanMeetingReviewSelect
                id={`${fieldId}-outcome`}
                label="本轮结论"
                invalid={Boolean(errors?.outcome)}
                placeholder="请选择通过或不通过"
                triggerRef={outcomeTriggerRef}
                disabled={isSubmitted || Boolean(busy)}
                value={outcome || null}
                options={[
                  { description: "继续推进面试", label: "通过", value: "pass" },
                  ...(isSubmitted && outcome === "inconclusive"
                    ? [{ label: "待定", value: "inconclusive" }]
                    : []),
                  { description: "终止面试", label: "不通过", value: "fail" },
                ]}
                onValueChange={(value) => {
                  const parsed = humanInterviewRoundOutcomeSchema.safeParse(value);
                  if (parsed.success) {
                    evaluationDirtyRef.current = true;
                    setOutcome(parsed.data);
                  }
                }}
              />
            </Field>
            <Field
              label="评级"
              id={`${fieldId}-rating`}
              required
              error={errors?.["evaluation.rating"]}
            >
              <HumanMeetingReviewSelect
                id={`${fieldId}-rating`}
                label="评级"
                invalid={Boolean(errors?.["evaluation.rating"])}
                placeholder="请选择评级"
                triggerRef={ratingTriggerRef}
                disabled={isSubmitted || Boolean(busy)}
                value={evaluation.rating}
                options={[
                  { description: "超出预期 · 薪资110%~130%", label: "A", value: "A" },
                  { description: "完全匹配 · 薪资100%~120%", label: "B", value: "B" },
                  { description: "基本匹配 · 薪资90%~110%", label: "C", value: "C" },
                  { description: "勉强接受 · 薪资80%~100%", label: "D", value: "D" },
                ]}
                onValueChange={(value) => {
                  const rating = humanInterviewEvaluationRatingSchema.safeParse(value);
                  if (!rating.success) {
                    return;
                  }
                  evaluationDirtyRef.current = true;
                  setEvaluation((current) => ({ ...current, rating: rating.data }));
                }}
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="mt-6 grid gap-5 md:grid-cols-2">
            {EVALUATION_TEXT_FIELDS.map(({ key, label, minHeight, placeholder, wide }) => (
              <Field
                key={key}
                id={`${fieldId}-${key}`}
                label={label}
                wide={wide}
                error={errors?.[`evaluation.${key}`]}
              >
                {renderEditor(key, label, minHeight, placeholder)}
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
              评价正在生成并核验依据，会议分析完成后仍需等待此步骤。此页面会自动更新，也可以稍后返回本轮评价审核并提交。
            </p>
          ) : null}
        </div>
      </ScrollArea>
      <div
        className={cn(
          "mx-auto flex w-full max-w-5xl shrink-0 flex-wrap items-end justify-between gap-3 bg-background p-4",
          renderShell && "border-t",
        )}
      >
        {isSubmitted ? (
          <div className="flex items-center gap-2">
            <div className="font-medium text-sm">本轮评价已保存 · {submittedOutcomeLabel}</div>
            {renderShell ? (
              <Button disabled={Boolean(busy)} onClick={requestClose} variant="outline">
                关闭
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="ml-auto flex w-full gap-2 md:w-auto max-md:[&>button]:flex-1">
            {renderShell ? (
              <Button disabled={Boolean(busy)} onClick={requestClose} variant="ghost">
                关闭
              </Button>
            ) : null}
            <Button
              disabled={Boolean(busy) || (!hasDraftContent && !review.evaluation)}
              onClick={async () => {
                const transcriptRevisionId = review.transcript?.id ?? null;
                await run("save", async () => {
                  await requestJson<unknown>(`${basePath}/evaluation-draft`, {
                    body: JSON.stringify({
                      evaluation: {
                        ...evaluation,
                        draftOutcome: outcome === "pass" || outcome === "fail" ? outcome : null,
                      },
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
              保存草稿
            </Button>
            <Button disabled={Boolean(busy)} onClick={() => form.handleSubmit()}>
              提交评价
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
