"use client";

import { IconLoader2, IconRefresh, IconSparkles } from "@tabler/icons-react";
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
import { Input } from "@/components/ui/input";
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

function describeTranscription(review: HumanInterviewReviewRecord): string {
  if (review.transcriptionState === "ready") {
    return `已生成 · 第 ${review.transcript?.revision ?? 0} 版`;
  }
  if (review.transcriptionState === "failed") {
    return review.transcriptionError || "转录失败，可重试";
  }
  return "录音结束后自动生成转录";
}

function describeEvaluationStatus(
  review: HumanInterviewReviewRecord,
  isSubmitted: boolean,
  submittedOutcomeLabel: string,
): string {
  if (isSubmitted) {
    return `本轮评价已提交 · ${submittedOutcomeLabel}`;
  }
  if (review.evaluationStatus === "generating") {
    return "正在分析完整对话…";
  }
  return review.evaluationError || "AI 草稿可由面试官修改后提交";
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

// eslint-disable-next-line complexity -- the review board coordinates transcript correction, AI drafting, and final submission states in one form.
export function HumanMeetingReview({
  active,
  inviteToken,
}: {
  active: boolean;
  inviteToken: string;
}) {
  const basePath = `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}`;
  const [review, setReview] = useState<HumanInterviewReviewRecord | null>(null);
  const [evaluation, setEvaluation] = useState<HumanInterviewEvaluation>(EMPTY_EVALUATION);
  const [outcome, setOutcome] = useState<HumanInterviewRoundOutcome>("inconclusive");
  const [transcriptTurns, setTranscriptTurns] = useState<
    NonNullable<HumanInterviewReviewRecord["transcript"]>["turns"]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [manualTranscriptText, setManualTranscriptText] = useState("");
  const evaluationDirtyRef = useRef(false);
  const transcriptDirtyRef = useRef(false);

  const load = useCallback(async () => {
    const next = await requestJson<HumanInterviewReviewRecord>(`${basePath}/review`, {
      cache: "no-store",
    });
    setReview(next);
    if (!evaluationDirtyRef.current) {
      setEvaluation(next.evaluation ?? EMPTY_EVALUATION);
      setOutcome(next.outcome ?? "inconclusive");
    }
    if (!transcriptDirtyRef.current) {
      setTranscriptTurns(next.transcript?.turns ?? []);
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

  async function saveTranscript() {
    if (!review?.transcript) {
      return;
    }
    await requestJson<unknown>(`${basePath}/transcript`, {
      body: JSON.stringify({
        language: review.transcript.language,
        sourceRevisionId: review.transcript.id,
        turns: transcriptTurns.map((turn) => ({
          confidence: null,
          endMs: turn.endMs,
          speakerDisplayName: turn.speakerDisplayName,
          speakerKey: turn.speakerKey,
          startMs: turn.startMs,
          text: turn.text,
          track: turn.track,
        })),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    transcriptDirtyRef.current = false;
    toast.success("转录已保存；现有 AI 评价不会被自动覆盖");
    await load();
  }

  async function saveDraft() {
    if (!review?.transcript) {
      return;
    }
    await requestJson<unknown>(`${basePath}/evaluation-draft`, {
      body: JSON.stringify({
        evaluation,
        transcriptRevisionId: review.transcript.id,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    evaluationDirtyRef.current = false;
    toast.success("评价草稿已保存");
    await load();
  }

  if (!review) {
    return (
      <div className="flex h-full items-center justify-center text-white/60 text-sm">
        <IconLoader2 className="mr-2 size-4 animate-spin" />
        加载会议复核内容…
      </div>
    );
  }

  const isSubmitted = review.evaluationStatus === "submitted" || review.roundStatus === "completed";
  const submittedOutcomeLabel = review.outcome ? OUTCOME_LABELS[review.outcome] : "已完成";

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-4 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-lg">会议转录</h2>
              <p className="text-white/50 text-xs">{describeTranscription(review)}</p>
            </div>
            <div className="flex gap-2">
              {review.meetingSessionId || isSubmitted ? null : (
                <Button
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    await run("live-transcript-recovery", async () => {
                      await requestJson<unknown>(`${basePath}/live-transcript-recovery`, {
                        method: "POST",
                      });
                      toast.success("已使用实时字幕恢复，正在生成 AI 评价");
                      await load();
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  <IconSparkles className="size-4" />
                  使用实时字幕生成评价
                </Button>
              )}
              {review.transcriptionState === "failed" && !isSubmitted ? (
                <Button
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    await run("retry", async () => {
                      await requestJson<unknown>(`${basePath}/transcription-retry`, {
                        method: "POST",
                      });
                      toast.success("已重新提交转录");
                      await load();
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  <IconRefresh className="size-4" />
                  重试转录
                </Button>
              ) : null}
              {review.transcript && !isSubmitted ? (
                <Button
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    await run("transcript", saveTranscript);
                  }}
                  size="sm"
                >
                  保存转录修改
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {review.transcriptionState === "failed" || review.transcript ? (
              <div className="space-y-3 rounded-md border border-amber-400/20 bg-amber-400/5 p-3">
                <div>
                  <Label htmlFor="manual-transcript">人工补录完整对话</Label>
                  <p className="mt-1 text-white/50 text-xs">
                    {review.transcript
                      ? "可粘贴人工复核后的完整对话；保存后将生成新的转录版本。"
                      : "可粘贴完整会议对话；保存后会自动进入同一套 AI 评价流程。"}
                  </p>
                </div>
                <Textarea
                  className="min-h-48 border-white/15 bg-black/20"
                  disabled={isSubmitted}
                  id="manual-transcript"
                  onChange={(event) => setManualTranscriptText(event.target.value)}
                  placeholder="例如：面试官：请介绍一下项目经验……\n候选人：……"
                  value={manualTranscriptText}
                />
                <Button
                  disabled={isSubmitted || Boolean(busy) || !manualTranscriptText.trim()}
                  onClick={async () => {
                    await run("manual-transcript", async () => {
                      await requestJson<unknown>(`${basePath}/transcript-manual`, {
                        body: JSON.stringify({ text: manualTranscriptText }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                      });
                      setManualTranscriptText("");
                      transcriptDirtyRef.current = false;
                      toast.success("人工补录已保存，正在生成 AI 评价");
                      await load();
                    });
                  }}
                  size="sm"
                >
                  保存人工补录
                </Button>
              </div>
            ) : null}
            {transcriptTurns.map((turn, index) => (
              <div className="grid gap-2 md:grid-cols-[180px_1fr]" key={turn.id}>
                <Input
                  className="border-white/15 bg-black/20"
                  disabled={isSubmitted}
                  onChange={(event) => {
                    transcriptDirtyRef.current = true;
                    setTranscriptTurns((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, speakerDisplayName: event.target.value || null }
                          : item,
                      ),
                    );
                  }}
                  placeholder={turn.speakerKey}
                  value={turn.speakerDisplayName ?? ""}
                />
                <Textarea
                  className="min-h-20 border-white/15 bg-black/20"
                  disabled={isSubmitted}
                  onChange={(event) => {
                    transcriptDirtyRef.current = true;
                    setTranscriptTurns((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, text: event.target.value } : item,
                      ),
                    );
                  }}
                  value={turn.text}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-lg">AI 评价与人工复核</h2>
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
              <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 font-medium text-emerald-300 text-sm">
                本轮评价已提交 · {submittedOutcomeLabel}
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  disabled={Boolean(busy) || !review.transcript}
                  onClick={async () => {
                    await run("draft", saveDraft);
                  }}
                  variant="outline"
                >
                  保存草稿
                </Button>
                <Button
                  disabled={
                    Boolean(busy) || !review.transcript || !evaluation.overallEvaluation.trim()
                  }
                  onClick={async () => {
                    const transcriptRevisionId = review.transcript?.id;
                    if (!transcriptRevisionId) {
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
                      await load();
                    });
                  }}
                >
                  提交评价
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
