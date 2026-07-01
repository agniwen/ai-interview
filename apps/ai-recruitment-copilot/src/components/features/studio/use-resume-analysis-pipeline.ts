"use client";

// 简历分析流水线 hook：parse → JD 匹配 → 语义查重。
// 出题不再自动跟在解析之后，而是由组件层在「保存并发起面试」按下时显式调用
// `generateQuestions()` 触发——按钮 loading 与流式 overlay 由本 hook 的 isBusy
// 状态自然驱动。
//
// Resume analysis pipeline hook. Owns parse → JD match → dedup state and all
// abort/stream plumbing. Question generation is NO LONGER auto-chained after
// parse; consumers explicitly call `generateQuestions()` (e.g. on "save and
// start interview"), which reuses the same overlay via isGeneratingQuestions.

import type { DedupMatchRecord } from "@/lib/client/api";
import { env } from "@/env/client";
import { fetchResumeDedup } from "@/lib/client/api";
import { readAiRunEventStream } from "@/lib/client/ai-run-event-stream";
import { matchJobDescriptionForResume, parseResumeFile } from "@/lib/client/resume-analysis";
import type { GenerateResumeReviewResult } from "@/lib/client/resume-analysis";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  appendUniqueStreamDelta,
  getCompletedProgressToolName,
  profilePreviewToPartialFields,
  rememberProgressStepLabel,
  upsertOcrPagePreview,
  upsertOcrPageProgress,
  upsertProgressTool,
} from "./resume-analysis-stream-state";
import type {
  ResumeOcrPagePreview,
  ResumeOcrPageProgress,
  ResumeOcrPageProgressDetail,
  ProgressStepLabels,
} from "./resume-analysis-stream-state";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

export interface ResumeAnalysisPipelineOptions {
  onProfileParsed: (input: { fileName: string; resumeProfile: ResumeProfile }) => void;
  onJobDescriptionMatched: (matchedId: string, reason: string | null) => void;
  onQuestionsGenerated: (questions: InterviewQuestion[]) => void;
  /**
   * JD 匹配完后基于（候选人 + 匹配岗位）生成的简历评价文本回调。可选——未传时
   * pipeline 不会触发评价生成。
   * Fired after the post-match resume-review generation. Optional; when omitted
   * the pipeline skips review generation entirely.
   */
  onReviewDraftChange?: (review: string) => void;
  onReviewGenerated?: (result: GenerateResumeReviewResult) => void;
}

export interface ResumeAnalysisPipelineState {
  isAnalyzingResume: boolean;
  isGeneratingQuestions: boolean;
  isGeneratingReview: boolean;
  // 简历解析完成后会异步调一次「按候选人匹配在招岗位」；这个 flag 在那段
  // 网络请求期间为 true，并纳入 isBusy，让三段分析遮罩连续展示。
  // True while the best-fit JD lookup runs (post-parse, async IIFE). It is part
  // of isBusy so the parse → match → review overlay feels continuous.
  isMatchingJobDescription: boolean;
  progressStatus: string;
  progressTools: { name: string; done: boolean }[];
  ocrPages: ResumeOcrPageProgress[];
  partialFields: { label: string; value: string }[];
  reviewPreview: string;
  dedupMatches: DedupMatchRecord[] | null;
  dedupConfirmed: boolean;
  resumePayload: ResumeAnalysisResult | null;
  resumeReview: GenerateResumeReviewResult["structuredReview"] | null;
  resumeFile: File | null;
  isBusy: boolean;
}

export interface ResumeAnalysisPipelineHandlers {
  handleResumeChange: (file: File | null) => Promise<void>;
  handleDedupConflict: (matches: DedupMatchRecord[]) => void;
  handleDedupContinue: () => void;
  handleCancelAnalysis: () => void;
  reset: () => void;
  // 按需出题。组件层在「保存并发起面试」时显式调用，返回更新后的 payload；
  // null 表示当前没有可用的 resumeProfile（例如完全手动录入）。
  // Explicit, on-demand question generation. Returns the updated payload, or
  // null if there is no resumeProfile to base questions on.
  generateQuestions: () => Promise<ResumeAnalysisResult | null>;
}

export type ResumeAnalysisPipeline = ResumeAnalysisPipelineState & ResumeAnalysisPipelineHandlers;

function isOcrPageProgressDetail(value: unknown): value is ResumeOcrPageProgressDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const detail = value as Partial<ResumeOcrPageProgressDetail>;
  return (
    detail.kind === "ocr-page" &&
    typeof detail.page === "number" &&
    typeof detail.totalPages === "number" &&
    (detail.status === "queued" ||
      detail.status === "running" ||
      detail.status === "completed" ||
      detail.status === "failed")
  );
}

function isOcrPagePreview(value: unknown): value is ResumeOcrPagePreview {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const preview = value as Partial<ResumeOcrPagePreview>;
  return typeof preview.page === "number" && typeof preview.totalPages === "number";
}

// oxlint-disable-next-line complexity -- The pipeline orchestrates parse, JD match, dedup, and question generation; splitting it further fragments shared state.
export function useResumeAnalysisPipeline(
  options: ResumeAnalysisPipelineOptions,
): ResumeAnalysisPipeline {
  const slug = useWorkspaceSlug();
  const {
    onProfileParsed,
    onJobDescriptionMatched,
    onQuestionsGenerated,
    onReviewDraftChange,
    onReviewGenerated,
  } = options;

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [resumeReview, setResumeReview] = useState<
    GenerateResumeReviewResult["structuredReview"] | null
  >(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [isMatchingJobDescription, setIsMatchingJobDescription] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [ocrPages, setOcrPages] = useState<ResumeOcrPageProgress[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const [reviewPreview, setReviewPreview] = useState("");
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  const [dedupConfirmed, setDedupConfirmed] = useState(false);
  const accumulatedTextRef = useRef("");
  const reviewTextRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressStepLabelsRef = useRef<ProgressStepLabels>({});
  // 缓存 Step 1 解析结果，用户在语义查重弹窗点"继续解析"时再驱动 Step 2。
  // Cache the Step 1 parse result so we can resume Step 2 after the user
  // clicks "继续解析" on the dedup overlay.
  const pendingProfileRef = useRef<ResumeProfile | null>(null);

  function tryExtractPartialFields(text: string) {
    const fields: { label: string; value: string }[] = [];
    const FIELD_MAP: { key: string; label: string }[] = [
      { key: '"name"', label: "姓名" },
      { key: '"gender"', label: "性别" },
      { key: '"age"', label: "年龄" },
      { key: '"workYears"', label: "工作年限" },
      { key: '"targetRoles"', label: "目标岗位" },
      { key: '"skills"', label: "技能" },
      { key: '"schools"', label: "院校" },
    ];

    for (const { key, label } of FIELD_MAP) {
      const idx = text.indexOf(key);
      if (idx === -1) {
        continue;
      }

      const afterColon = text.indexOf(":", idx + key.length);
      if (afterColon === -1) {
        continue;
      }

      const rest = text.slice(afterColon + 1).trimStart();
      if (!rest) {
        continue;
      }

      // Extract string value: "value"
      if (rest.startsWith('"')) {
        const endQuote = rest.indexOf('"', 1);
        if (endQuote > 1) {
          const val = rest.slice(1, endQuote);
          if (val && val !== "未发现信息") {
            fields.push({ label, value: val });
          }
        }
      }
      // Extract number: 5
      else if (LEADING_DIGIT_RE.test(rest)) {
        const match = rest.match(LEADING_DIGITS_RE);
        if (match) {
          fields.push({ label, value: match[1] });
        }
      }
      // Extract array: ["a", "b"]
      else if (rest.startsWith("[")) {
        const endBracket = rest.indexOf("]");
        if (endBracket > 1) {
          try {
            const arr = JSON.parse(rest.slice(0, endBracket + 1)) as string[];
            if (arr.length > 0) {
              fields.push({ label, value: arr.slice(0, 5).join("、") });
            }
          } catch {
            /* partial array, skip */
          }
        }
      }
    }

    return fields;
  }

  function appendAnalysisDelta(text: string) {
    accumulatedTextRef.current = appendUniqueStreamDelta(accumulatedTextRef.current, text);
    const fields = tryExtractPartialFields(accumulatedTextRef.current);
    if (fields.length > 0) {
      setPartialFields(fields);
    }
  }

  // oxlint-disable-next-line complexity -- Handles the legacy stream and AiRun stream event union in one state reducer.
  function handleStreamEvent(event: AnalysisStreamEvent) {
    if (event.type === "run.started") {
      setProgressStatus(event.title);
    } else if (event.type === "step.started") {
      progressStepLabelsRef.current = rememberProgressStepLabel(
        progressStepLabelsRef.current,
        event.stepId,
        event.label,
      );
      setProgressTools((prev) => upsertProgressTool(prev, event.label, false));
      setProgressStatus(event.label);
    } else if (event.type === "step.progress" && event.label) {
      const { detail } = event;
      if (isOcrPageProgressDetail(detail)) {
        setOcrPages((prev) => upsertOcrPageProgress(prev, detail));
      }
      setProgressStatus(event.label);
    } else if (event.type === "step.preview" && event.artifactType === "resume.ocr.page") {
      const preview = event.data;
      if (isOcrPagePreview(preview)) {
        setOcrPages((prev) => upsertOcrPagePreview(prev, preview));
      }
    } else if (event.type === "step.preview" && event.artifactType === "resume.profile.preview") {
      const fields = profilePreviewToPartialFields(event.data);
      if (fields.length > 0) {
        setPartialFields(fields);
      }
    } else if (event.type === "step.completed") {
      setProgressTools((prev) =>
        upsertProgressTool(
          prev,
          getCompletedProgressToolName(event, progressStepLabelsRef.current),
          true,
        ),
      );
    } else if (event.type === "step.delta") {
      appendAnalysisDelta(event.text);
    } else if (event.type === "run.failed") {
      setProgressStatus(event.error.message);
    } else if (event.type === "run.suspended" || event.type === "approval.required") {
      setProgressStatus("等待人工确认。");
    }
  }

  async function runQuestionGeneration(profileBundle: {
    fileName: string;
    resumeProfile: ResumeProfile;
    resumeText: string | null;
  }): Promise<ResumeAnalysisResult | null> {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGeneratingQuestions(true);
    setProgressStatus("正在生成面试题…");
    setProgressTools([]);
    setOcrPages([]);
    setPartialFields([]);
    setReviewPreview("");
    setResumeReview(null);
    accumulatedTextRef.current = "";
    reviewTextRef.current = "";
    progressStepLabelsRef.current = {};

    try {
      // 流式响应不能走 rpcFetch（parseResponse 会消费 body），但可以用 hc 客户端
      // 拿 URL + 类型推断，直接 await 取 Response 自己读流。
      // hc with streaming: route via the typed RPC for URL + body type-safety,
      // then read response.body manually (rpcFetch would consume the stream).
      const qResponse = await rpc.api.interview["generate-questions"].$post(
        { json: { resumeProfile: profileBundle.resumeProfile } },
        { init: { signal: abortController.signal } },
      );

      if (!qResponse.ok) {
        const errBody = (await qResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "面试题生成失败");
      }

      let questions: InterviewQuestion[] | null = null;
      let streamError: string | null = null;

      await readAiRunEventStream<AnalysisStreamEvent>(
        qResponse,
        (event) => {
          handleStreamEvent(event);
          if (event.type === "run.completed") {
            const data = event.output as { interviewQuestions?: InterviewQuestion[] } | undefined;
            questions = data?.interviewQuestions ?? questions;
          }
          if (event.type === "run.failed") {
            streamError = event.error.message;
          }
        },
        abortController.signal,
      );

      if (streamError) {
        throw new Error(streamError);
      }

      if (!questions) {
        return null;
      }

      const updated: ResumeAnalysisResult = {
        fileName: profileBundle.fileName,
        interviewQuestions: questions,
        resumeProfile: profileBundle.resumeProfile,
        resumeText: profileBundle.resumeText,
      };
      setResumePayload(updated);
      onQuestionsGenerated(questions);
      toast.success("面试题生成完成");
      return updated;
    } catch (error) {
      if (abortController.signal.aborted) {
        return null;
      }
      toast.error(error instanceof Error ? error.message : "面试题生成失败");
      return null;
    } finally {
      abortControllerRef.current = null;
      setIsGeneratingQuestions(false);
      setProgressStatus("");
      setProgressTools([]);
      setOcrPages([]);
      setPartialFields([]);
      setReviewPreview("");
      accumulatedTextRef.current = "";
      reviewTextRef.current = "";
      progressStepLabelsRef.current = {};
    }
  }

  // oxlint-disable-next-line complexity -- Orchestrates parse → fill form → JD match → dedup branch → optional Step 2; extracting fragments the shared state.
  const handleResumeChange = useCallback(
    async (file: File | null) => {
      setResumeFile(file);
      setResumePayload(null);
      setResumeReview(null);
      setDedupMatches(null);
      setDedupConfirmed(false);
      pendingProfileRef.current = null;
      setProgressStatus("");
      setProgressTools([]);
      setOcrPages([]);
      setPartialFields([]);
      setReviewPreview("");
      accumulatedTextRef.current = "";
      reviewTextRef.current = "";
      progressStepLabelsRef.current = {};

      if (!file) {
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsAnalyzingResume(true);
      let postParseAnalysisStarted = false;

      try {
        const parseResult = await parseResumeFile(file, {
          onEvent: (event) => {
            handleStreamEvent(event);
          },
          progress: true,
          signal: abortController.signal,
        });

        const { fileName, resumeProfile, resumeText } = parseResult;

        onProfileParsed({ fileName, resumeProfile });
        setResumePayload({
          fileName,
          interviewQuestions: [],
          resumeProfile,
          resumeText,
        });
        setIsAnalyzingResume(false);
        setProgressTools([]);
        setOcrPages([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";
        progressStepLabelsRef.current = {};
        toast.success("简历解析完成，已回填候选人信息");

        // Match best in-flight job description; non-fatal on failure.
        // 匹配完之后串行触发简历评价生成（按需），评价依赖匹配到的 JD 上下文。
        // 自动匹配 / 评价生成失败都静默继续，不阻塞主流程。
        // Match best in-flight JD, then chain resume-review generation using
        // the matched JD as context. Both steps are best-effort; failures are
        // swallowed so the main flow keeps going.
        postParseAnalysisStarted = true;
        void (async () => {
          let matchedJdId: string | null = null;
          setIsMatchingJobDescription(true);
          setProgressStatus("正在分析匹配岗位…");
          try {
            const matchPayload = await matchJobDescriptionForResume(resumeProfile, {
              signal: abortController.signal,
            });
            if (matchPayload?.matchedId) {
              matchedJdId = matchPayload.matchedId;
              onJobDescriptionMatched(matchPayload.matchedId, matchPayload.reason ?? null);
              toast.success(
                matchPayload.reason
                  ? `已匹配在招岗位：${matchPayload.reason}`
                  : "已自动匹配在招岗位",
              );
            }
          } catch {
            // swallow — user can still pick manually / 静默忽略，用户可手动选择
          } finally {
            if (!abortController.signal.aborted) {
              setIsMatchingJobDescription(false);
              if (!onReviewGenerated) {
                setProgressStatus("");
              }
            }
          }

          // 评价生成是可选步骤：调用方未传 onReviewGenerated 就不跑（保持原 pipeline 行为）。
          // Skip review generation when the caller didn't opt in.
          if (!onReviewGenerated || abortController.signal.aborted) {
            return;
          }
          setIsGeneratingReview(true);
          setProgressStatus("正在生成简历评价…");
          setReviewPreview("");
          reviewTextRef.current = "";
          try {
            // 流式响应：用 hc 拿 URL/类型，body 自己读 AiRun SSE。
            // Streaming endpoint: hc for URL + types, manually consume the
            // ReadableStream body (rpcFetch would parse the whole body).
            const reviewResponse = await rpc.api.interview["generate-review"].$post(
              { json: { jobDescriptionId: matchedJdId, resumeProfile } },
              { init: { signal: abortController.signal } },
            );
            if (!reviewResponse.ok) {
              return;
            }

            let reviewResult: GenerateResumeReviewResult | null = null;
            await readAiRunEventStream<AnalysisStreamEvent>(
              reviewResponse,
              (event) => {
                if (event.type === "step.delta") {
                  reviewTextRef.current = appendUniqueStreamDelta(
                    reviewTextRef.current,
                    event.text,
                  );
                  const draft = reviewTextRef.current;
                  setReviewPreview(draft);
                  onReviewDraftChange?.(draft);
                }
                if (event.type === "run.completed") {
                  const data = event.output as Partial<GenerateResumeReviewResult> | undefined;
                  if (data?.review && data.structuredReview) {
                    reviewResult = {
                      review: data.review,
                      structuredReview: data.structuredReview,
                    };
                    setReviewPreview(reviewResult.review);
                    setResumeReview(reviewResult.structuredReview);
                    onReviewDraftChange?.(reviewResult.review);
                  }
                }
              },
              abortController.signal,
            );

            if (reviewResult) {
              onReviewGenerated(reviewResult);
              toast.success("已生成简历评价");
            }
          } catch {
            // 评价生成失败不打扰用户——属于增益步骤，用户仍可手动填写。
            // Review generation is a bonus step; silent failure is fine since
            // the user can still write the field manually.
          } finally {
            if (!abortController.signal.aborted) {
              setIsGeneratingReview(false);
              setProgressStatus("");
            }
          }
        })();

        // 语义查重：失败时静默继续。命中时仅展示 overlay 让用户确认，
        // 不再继续触发任何流程；出题挪到「保存并发起面试」时按需触发。
        // Semantic dedup check. If hit, just surface the overlay for
        // confirmation — no more chained question generation. Question
        // generation is deferred to the "save and start interview" action.
        try {
          console.info("[resume-upload-dedup] request", {
            hasResumeProfile: Boolean(resumeProfile),
            workspaceSlug: slug,
          });
          const { matches } = await fetchResumeDedup(
            slug,
            {
              email: resumeProfile.email,
              name: resumeProfile.name,
              phone: resumeProfile.phone,
              resumeProfile,
            },
            { signal: abortController.signal },
          );
          console.info("[resume-upload-dedup] response", {
            matchCount: matches.length,
            matches: matches.map((match) => ({
              id: match.id,
              level: match.level,
              score: match.score,
              semanticReasons: match.semanticReasons,
              similarity: match.similarity,
            })),
            workspaceSlug: slug,
          });
          if (matches.length > 0) {
            pendingProfileRef.current = resumeProfile;
            setDedupMatches(matches);
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            toast.warning(
              error instanceof Error
                ? `语义查重失败，已跳过：${error.message}`
                : "语义查重失败，已跳过",
            );
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        setResumePayload(null);
        setResumeFile(null);
        toast.error(error instanceof Error ? error.message : "简历分析失败");
      } finally {
        // 不在这里把 abortControllerRef.current 置 null：上面的"匹配岗位 + 简历评价"
        // 是 fire-and-forget 的 IIFE，复用同一个 abortController；如果在外层 finally
        // 提前置 null，用户在 review 流式阶段点「取消」就找不到 controller，
        // 导致 abort() 失效、网络请求继续跑、结果照样回填表单。
        // ref 让它继续指向同一个 controller 即可——abort() 对已结束的 controller
        // 是 no-op，下次 handleResumeChange 会自然覆盖。
        // Do NOT null abortControllerRef here: the match-JD + review IIFE is
        // fire-and-forget and shares this controller. Clearing the ref while
        // it's still alive means the 取消 button can't reach it during the
        // review stream — abort() becomes a silent no-op and the request
        // keeps running. Leaving the ref pointed at the same controller is
        // safe (abort() on a settled controller is a no-op) and a fresh
        // handleResumeChange call will overwrite it.
        setIsAnalyzingResume(false);
        setIsGeneratingQuestions(false);
        // 不在 finally 里清 isGeneratingReview：评价生成是 fire-and-forget 在 IIFE 里跑，
        // 主流程到达 finally 时它可能还在进行中。让评价的 IIFE 自己结束时清掉。
        // Don't clear isGeneratingReview here — the review IIFE outlives this
        // finally; it owns its own teardown.
        if (!postParseAnalysisStarted) {
          setProgressStatus("");
          setProgressTools([]);
          setOcrPages([]);
          setPartialFields([]);
        }
        accumulatedTextRef.current = "";
      }
    },
    [onJobDescriptionMatched, onProfileParsed, onReviewDraftChange, onReviewGenerated, slug],
  );

  const handleDedupContinue = useCallback(() => {
    // 解析后再次确认入库 —— 出题已挪到「保存并发起面试」时，这里只清 overlay。
    // Post-dedup confirmation simply dismisses the overlay; question generation
    // happens later, on the save-and-start path.
    setDedupMatches(null);
    setDedupConfirmed(true);
    pendingProfileRef.current = null;
  }, []);

  const handleDedupConflict = useCallback((matches: DedupMatchRecord[]) => {
    setDedupMatches(matches);
    setDedupConfirmed(false);
    pendingProfileRef.current = null;
  }, []);

  const handleCancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    setResumeFile(null);
    setResumePayload(null);
    setResumeReview(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setIsGeneratingReview(false);
    setIsMatchingJobDescription(false);
    setProgressStatus("");
    setProgressTools([]);
    setOcrPages([]);
    setPartialFields([]);
    setReviewPreview("");
    setDedupMatches(null);
    setDedupConfirmed(false);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    reviewTextRef.current = "";
    progressStepLabelsRef.current = {};
    toast.info("已取消简历分析");
  }, []);

  const generateQuestions = useCallback((): Promise<ResumeAnalysisResult | null> => {
    if (!resumePayload) {
      return Promise.resolve(null);
    }
    if (!env.NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS) {
      return Promise.resolve(resumePayload);
    }
    return runQuestionGeneration({
      fileName: resumePayload.fileName,
      resumeProfile: resumePayload.resumeProfile,
      resumeText: resumePayload.resumeText,
    });
    // runQuestionGeneration closes over fresh state via setResumePayload; it is
    // stable enough to omit from deps. resumePayload is the only thing we read
    // directly at call time.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [resumePayload]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResumeFile(null);
    setResumePayload(null);
    setResumeReview(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setIsGeneratingReview(false);
    setIsMatchingJobDescription(false);
    setProgressStatus("");
    setProgressTools([]);
    setOcrPages([]);
    setPartialFields([]);
    setReviewPreview("");
    setDedupMatches(null);
    setDedupConfirmed(false);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    reviewTextRef.current = "";
    progressStepLabelsRef.current = {};
  }, []);

  // 等待用户决定时的 overlay 也算"忙"——禁止关闭外层弹窗，避免在用户决定前丢状态。
  // 评价生成也算"忙"：让保存按钮在评价回填前 disabled，避免用户先点保存把空 notes 落库。
  // Block "save" while review is generating, otherwise the user can submit
  // before the auto-fill lands and end up with an empty notes field.
  const isBusy =
    isAnalyzingResume ||
    isMatchingJobDescription ||
    isGeneratingQuestions ||
    isGeneratingReview ||
    dedupMatches !== null;

  return {
    dedupConfirmed,
    dedupMatches,
    generateQuestions,
    handleCancelAnalysis,
    handleDedupConflict,
    handleDedupContinue,
    handleResumeChange,
    isAnalyzingResume,
    isBusy,
    isGeneratingQuestions,
    isGeneratingReview,
    isMatchingJobDescription,
    ocrPages,
    partialFields,
    progressStatus,
    progressTools,
    reset,
    resumeFile,
    resumePayload,
    resumeReview,
    reviewPreview,
  };
}
