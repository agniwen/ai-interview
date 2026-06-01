"use client";

// 简历分析流水线 hook：parse → JD 匹配 → 身份查重。
// 出题不再自动跟在解析之后，而是由组件层在「保存并发起面试」按下时显式调用
// `generateQuestions()` 触发——按钮 loading 与流式 overlay 由本 hook 的 isBusy
// 状态自然驱动。
//
// Resume analysis pipeline hook. Owns parse → JD match → dedup state and all
// abort/stream plumbing. Question generation is NO LONGER auto-chained after
// parse; consumers explicitly call `generateQuestions()` (e.g. on "save and
// start interview"), which reuses the same overlay via isGeneratingQuestions.

import type { DedupMatchRecord } from "@/lib/client/api";
import { fetchInterviewDedup } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";
import { RESUME_LIBRARY_NOTES_INPUT_MAX_LENGTH } from "@/lib/shared/studio-resumes";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

function clampReviewDraft(review: string) {
  return review.slice(0, RESUME_LIBRARY_NOTES_INPUT_MAX_LENGTH);
}

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
  onReviewGenerated?: (review: string) => void;
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
  partialFields: { label: string; value: string }[];
  reviewPreview: string;
  dedupMatches: DedupMatchRecord[] | null;
  resumePayload: ResumeAnalysisResult | null;
  resumeFile: File | null;
  isBusy: boolean;
}

export interface ResumeAnalysisPipelineHandlers {
  handleResumeChange: (file: File | null) => Promise<void>;
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
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [isMatchingJobDescription, setIsMatchingJobDescription] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const [reviewPreview, setReviewPreview] = useState("");
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  const accumulatedTextRef = useRef("");
  const reviewTextRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  // 缓存 Step 1 解析结果，用户在身份查重弹窗点"继续解析"时再驱动 Step 2。
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

  function handleStreamEvent(event: AnalysisStreamEvent) {
    if (event.type === "status") {
      setProgressStatus(event.message);
    } else if (event.type === "tool-start") {
      setProgressTools((prev) => [...prev, { done: false, name: event.name }]);
    } else if (event.type === "tool-end") {
      setProgressTools((prev) =>
        prev.map((t) => (t.name === event.name ? { ...t, done: true } : t)),
      );
    } else if (event.type === "text-delta") {
      accumulatedTextRef.current += event.text;
      const fields = tryExtractPartialFields(accumulatedTextRef.current);
      if (fields.length > 0) {
        setPartialFields(fields);
      }
    }
  }

  async function runQuestionGeneration(profileBundle: {
    fileName: string;
    resumeProfile: ResumeProfile;
  }): Promise<ResumeAnalysisResult | null> {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGeneratingQuestions(true);
    setProgressStatus("正在生成面试题…");
    setProgressTools([]);
    setPartialFields([]);
    setReviewPreview("");
    accumulatedTextRef.current = "";
    reviewTextRef.current = "";

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

      await readNdjsonStream<AnalysisStreamEvent>(
        qResponse,
        (event) => {
          handleStreamEvent(event);
          if (event.type === "result") {
            const data = event.data as { interviewQuestions?: InterviewQuestion[] };
            questions = data.interviewQuestions ?? null;
          }
          if (event.type === "error") {
            streamError = event.message;
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
      setPartialFields([]);
      setReviewPreview("");
      accumulatedTextRef.current = "";
      reviewTextRef.current = "";
    }
  }

  // oxlint-disable-next-line complexity -- Orchestrates parse → fill form → JD match → dedup branch → optional Step 2; extracting fragments the shared state.
  const handleResumeChange = useCallback(
    async (file: File | null) => {
      setResumeFile(file);
      setResumePayload(null);
      setDedupMatches(null);
      pendingProfileRef.current = null;
      setProgressStatus("");
      setProgressTools([]);
      setPartialFields([]);
      setReviewPreview("");
      accumulatedTextRef.current = "";
      reviewTextRef.current = "";

      if (!file) {
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsAnalyzingResume(true);
      let postParseAnalysisStarted = false;

      try {
        // Step 1: stream parse resume profile
        const formData = new FormData();
        formData.append("resume", file);

        const parseResponse = await fetch("/api/interview/parse-resume", {
          body: formData,
          method: "POST",
          signal: abortController.signal,
        });

        if (!parseResponse.ok) {
          const errBody = (await parseResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errBody?.error ?? "简历解析失败");
        }

        interface ParseResult {
          fileName: string;
          resumeProfile: ResumeProfile;
        }
        let parseResult: ParseResult | null = null;
        let streamError: string | null = null;

        await readNdjsonStream<AnalysisStreamEvent>(
          parseResponse,
          (event) => {
            handleStreamEvent(event);
            if (event.type === "result") {
              parseResult = event.data as ParseResult;
            }
            if (event.type === "error") {
              streamError = event.message;
            }
          },
          abortController.signal,
        );

        if (streamError) {
          throw new Error(streamError);
        }

        if (!parseResult) {
          throw new Error("简历解析未返回有效结果");
        }

        const { fileName, resumeProfile } = parseResult as ParseResult;

        onProfileParsed({ fileName, resumeProfile });
        setResumePayload({
          fileName,
          interviewQuestions: [],
          resumeProfile,
        });
        setIsAnalyzingResume(false);
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";
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
            const matchResponse = await rpc.api.interview["match-job-description"].$post(
              { json: { resumeProfile } },
              { init: { signal: abortController.signal } },
            );
            if (!matchResponse.ok) {
              return;
            }
            const matchPayload = (await matchResponse.json().catch(() => null)) as {
              matchedId?: string | null;
              reason?: string | null;
            } | null;
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
            // 流式响应：用 hc 拿 URL/类型，body 自己读 NDJSON。
            // Streaming endpoint: hc for URL + types, manually consume the
            // ReadableStream body (rpcFetch would parse the whole body).
            const reviewResponse = await rpc.api.interview["generate-review"].$post(
              { json: { jobDescriptionId: matchedJdId, resumeProfile } },
              { init: { signal: abortController.signal } },
            );
            if (!reviewResponse.ok) {
              return;
            }

            let review: string | null = null;
            await readNdjsonStream<AnalysisStreamEvent>(
              reviewResponse,
              (event) => {
                if (event.type === "text-delta") {
                  reviewTextRef.current += event.text;
                  const draft = clampReviewDraft(reviewTextRef.current);
                  setReviewPreview(draft);
                  onReviewDraftChange?.(draft);
                }
                if (event.type === "result") {
                  const data = event.data as { review?: string };
                  review = data.review ? clampReviewDraft(data.review) : null;
                  if (review) {
                    setReviewPreview(review);
                    onReviewDraftChange?.(review);
                  }
                }
              },
              abortController.signal,
            );

            if (review) {
              onReviewGenerated(review);
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

        // 身份维度查重：simple OR-match by name/email/phone。失败时静默继续。
        // 命中时仅展示 overlay 让用户确认，不再继续触发任何流程；
        // 出题挪到「保存并发起面试」时按需触发。
        // Identity dedup check (OR-match). If hit, just surface the overlay
        // for confirmation — no more chained question generation. Question
        // generation is deferred to the "save and start interview" action.
        try {
          const { matches } = await fetchInterviewDedup(
            slug,
            {
              email: resumeProfile.email,
              name: resumeProfile.name,
              phone: resumeProfile.phone,
            },
            { signal: abortController.signal },
          );
          if (matches.length > 0) {
            pendingProfileRef.current = resumeProfile;
            setDedupMatches(matches);
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            toast.warning(
              error instanceof Error
                ? `身份查重失败，已跳过：${error.message}`
                : "身份查重失败，已跳过",
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
    pendingProfileRef.current = null;
  }, []);

  const handleCancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setIsGeneratingReview(false);
    setIsMatchingJobDescription(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setReviewPreview("");
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    reviewTextRef.current = "";
    toast.info("已取消简历分析");
  }, []);

  const generateQuestions = useCallback((): Promise<ResumeAnalysisResult | null> => {
    if (!resumePayload) {
      return Promise.resolve(null);
    }
    return runQuestionGeneration({
      fileName: resumePayload.fileName,
      resumeProfile: resumePayload.resumeProfile,
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
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setIsGeneratingReview(false);
    setIsMatchingJobDescription(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setReviewPreview("");
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    reviewTextRef.current = "";
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
    dedupMatches,
    generateQuestions,
    handleCancelAnalysis,
    handleDedupContinue,
    handleResumeChange,
    isAnalyzingResume,
    isBusy,
    isGeneratingQuestions,
    isGeneratingReview,
    isMatchingJobDescription,
    partialFields,
    progressStatus,
    progressTools,
    reset,
    resumeFile,
    resumePayload,
    reviewPreview,
  };
}
