"use client";

// 简历分析流水线 hook：parse → JD 匹配 → 身份查重 → 出题。
// 简历库与 AI 面试两个新建入口共用。组件层只负责回填表单 / 渲染 overlay；
// 所有 NDJSON 流式解析、abortController、状态机都封装在这里。
//
// Resume analysis pipeline hook shared by the resume library and AI interview
// create dialogs. Owns parse → JD match → dedup → questions state and all
// abort/stream plumbing; consumers wire callbacks and render the overlay.

import type { DedupMatchRecord } from "@/lib/client/api";
import { fetchInterviewDedup } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/shared/interview/types";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

export interface ResumeAnalysisPipelineOptions {
  onProfileParsed: (input: { fileName: string; resumeProfile: ResumeProfile }) => void;
  onJobDescriptionMatched: (matchedId: string, reason: string | null) => void;
  onQuestionsGenerated: (questions: InterviewQuestion[]) => void;
}

export interface ResumeAnalysisPipelineState {
  isAnalyzingResume: boolean;
  isGeneratingQuestions: boolean;
  progressStatus: string;
  progressTools: { name: string; done: boolean }[];
  partialFields: { label: string; value: string }[];
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
}

export type ResumeAnalysisPipeline = ResumeAnalysisPipelineState & ResumeAnalysisPipelineHandlers;

// oxlint-disable-next-line complexity -- The pipeline orchestrates parse, JD match, dedup, and question generation; splitting it further fragments shared state.
export function useResumeAnalysisPipeline(
  options: ResumeAnalysisPipelineOptions,
): ResumeAnalysisPipeline {
  const slug = useWorkspaceSlug();
  const { onProfileParsed, onJobDescriptionMatched, onQuestionsGenerated } = options;

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  const accumulatedTextRef = useRef("");
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
  }) {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGeneratingQuestions(true);
    setProgressStatus("正在生成面试题…");
    setProgressTools([]);
    setPartialFields([]);
    accumulatedTextRef.current = "";

    try {
      const qResponse = await fetch("/api/interview/generate-questions", {
        body: JSON.stringify({ resumeProfile: profileBundle.resumeProfile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

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

      if (questions) {
        setResumePayload({
          fileName: profileBundle.fileName,
          interviewQuestions: questions,
          resumeProfile: profileBundle.resumeProfile,
        });
        onQuestionsGenerated(questions);
        toast.success("面试题生成完成");
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "面试题生成失败");
    } finally {
      abortControllerRef.current = null;
      setIsGeneratingQuestions(false);
      setProgressStatus("");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";
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
      accumulatedTextRef.current = "";

      if (!file) {
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsAnalyzingResume(true);

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
        // 自动匹配在招岗位；失败时静默继续。
        void (async () => {
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
              onJobDescriptionMatched(matchPayload.matchedId, matchPayload.reason ?? null);
              toast.success(
                matchPayload.reason
                  ? `已匹配在招岗位：${matchPayload.reason}`
                  : "已自动匹配在招岗位",
              );
            }
          } catch {
            // swallow — user can still pick manually / 静默忽略，用户可手动选择
          }
        })();

        // 身份维度查重：simple OR-match by name/email/phone。失败时静默继续。
        // Identity dedup check; on failure proceed silently (don't block the upload).
        let dedupHit = false;
        try {
          const { matches } = await fetchInterviewDedup(slug, {
            email: resumeProfile.email,
            name: resumeProfile.name,
            phone: resumeProfile.phone,
          });
          if (matches.length > 0) {
            dedupHit = true;
            pendingProfileRef.current = resumeProfile;
            setDedupMatches(matches);
            // 此处不抛、不继续 Step 2 —— finally 会把 abortController 清掉，
            // 等用户点"继续解析"时再用新的 abortController 启动 Step 2。
            // Don't throw, don't run Step 2 — the finally block clears the
            // abortController; "继续解析" spins up a fresh one for Step 2.
            return;
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

        if (!dedupHit) {
          await runQuestionGeneration({ fileName, resumeProfile });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        setResumePayload(null);
        setResumeFile(null);
        toast.error(error instanceof Error ? error.message : "简历分析失败");
      } finally {
        abortControllerRef.current = null;
        setIsAnalyzingResume(false);
        setIsGeneratingQuestions(false);
        setProgressStatus("");
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";
      }
    },
    [onJobDescriptionMatched, onProfileParsed, slug],
  );

  const handleDedupContinue = useCallback(() => {
    const profile = pendingProfileRef.current;
    setDedupMatches(null);
    pendingProfileRef.current = null;
    if (profile && resumePayload) {
      void runQuestionGeneration({ fileName: resumePayload.fileName, resumeProfile: profile });
    }
  }, [resumePayload]);

  const handleCancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    toast.info("已取消简历分析");
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
  }, []);

  // 等待用户决定时的 overlay 也算"忙"——禁止关闭外层弹窗，避免在用户决定前丢状态。
  // The dedup-confirmation overlay also counts as "busy" so the outer modal
  // cannot be dismissed before the user decides.
  const isBusy = isAnalyzingResume || isGeneratingQuestions || dedupMatches !== null;

  return {
    dedupMatches,
    handleCancelAnalysis,
    handleDedupContinue,
    handleResumeChange,
    isAnalyzingResume,
    isBusy,
    isGeneratingQuestions,
    partialFields,
    progressStatus,
    progressTools,
    reset,
    resumeFile,
    resumePayload,
  };
}
