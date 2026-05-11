"use client";

import type { FileUIPart } from "ai";
import type { InterviewQuestion, ResumeAnalysisResult } from "@/lib/shared/interview/types";
import type { StudioInterviewRecord } from "@/lib/shared/studio-interviews";
import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";
import { CheckIcon, DatabaseIcon, EyeIcon, LoaderCircleIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ImportProgressModal } from "@/components/resume-import/import-progress-modal";
import { JdPickModal } from "@/components/resume-import/jd-pick-modal";
import type {
  ImportPhase,
  ParseResult,
  PartialField,
  ProgressTool,
} from "@/components/resume-import/types";
import { dataUrlToFile, tryExtractPartialFields } from "@/components/resume-import/utils";
import { Button } from "@/components/ui/button";
import type { DedupMatchRecord } from "@/lib/client/api";
import { fetchInterviewDedup } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
import { rpc } from "@/lib/client/rpc";
import { cn } from "@/lib/shared/utils";

// 详情弹窗只在入库成功后才打开；动态加载省初始 bundle。
// Dialog only opens after a successful import; dynamic import keeps it out
// of the initial bundle.
const InterviewDetailDialog = dynamic(
  async () => {
    const mod = await import("@/app/(auth)/studio/interviews/_components/interview-detail-dialog");
    return mod.InterviewDetailDialog;
  },
  { ssr: false },
);

interface ResumeImportButtonProps {
  filePart: FileUIPart & { id: string };
  importedInterviewId: string | null;
  onImported: (partId: string, interviewId: string) => void;
  onMissing?: (partId: string) => void;
  className?: string;
}

function renderImportButtonContent({
  importedInterviewId,
  isImporting,
}: {
  importedInterviewId: string | null;
  isImporting: boolean;
}) {
  if (importedInterviewId) {
    return (
      <>
        <CheckIcon className="size-3.5" />
        已入库
        <EyeIcon className="size-3.5 opacity-70" />
      </>
    );
  }
  if (isImporting) {
    return (
      <>
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        入库中
      </>
    );
  }
  return (
    <>
      <DatabaseIcon className="size-3.5" />
      一键入库
    </>
  );
}

export function ResumeImportButton({
  filePart,
  importedInterviewId,
  onImported,
  onMissing,
  className,
}: ResumeImportButtonProps) {
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<ProgressTool[]>([]);
  const [partialFields, setPartialFields] = useState<PartialField[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [isPickingJd, setIsPickingJd] = useState(false);
  const [selectedJdId, setSelectedJdId] = useState("");
  const [jdError, setJdError] = useState<string | undefined>();
  const [isAnalyzingMatch, setIsAnalyzingMatch] = useState(false);
  const [matchReason, setMatchReason] = useState<string | null>(null);
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const matchAbortControllerRef = useRef<AbortController | null>(null);
  const cachedParseResultRef = useRef<ParseResult | null>(null);
  const accumulatedTextRef = useRef("");
  // 暂存身份查重命中时的状态：用户点"继续解析"才会真正进入 Step 2/3。
  // Cached state for the dedup-pause flow so "继续解析" can resume Step 2/3.
  const pendingResumeFileRef = useRef<File | null>(null);
  const pendingJobDescriptionIdRef = useRef<string | null>(null);

  const isImporting = phase !== "idle" || Boolean(dedupMatches);

  const resetProgress = useCallback(() => {
    setPhase("idle");
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setDedupMatches(null);
    pendingResumeFileRef.current = null;
    pendingJobDescriptionIdRef.current = null;
    accumulatedTextRef.current = "";
  }, []);

  const handleStreamEvent = useCallback((event: AnalysisStreamEvent) => {
    if (event.type === "status") {
      setProgressStatus(event.message);
    } else if (event.type === "tool-start") {
      setProgressTools((prev) => [...prev, { done: false, name: event.name }]);
    } else if (event.type === "tool-end") {
      setProgressTools((prev) =>
        prev.map((tool) => (tool.name === event.name ? { ...tool, done: true } : tool)),
      );
    } else if (event.type === "text-delta") {
      accumulatedTextRef.current += event.text;
      const fields = tryExtractPartialFields(accumulatedTextRef.current);
      if (fields.length > 0) {
        setPartialFields(fields);
      }
    }
  }, []);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    resetProgress();
    toast.info("已取消简历入库");
  }, [resetProgress]);

  // oxlint-disable-next-line complexity -- Import flow orchestrates upload → analyze → persist with progress state.
  async function runImport(jobDescriptionId: string) {
    if (!filePart.url || !filePart.filename) {
      toast.error("简历文件不完整，无法入库");
      return;
    }
    if (!jobDescriptionId) {
      toast.error("请选择在招岗位后再入库");
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setPhase("preparing");
    setProgressStatus("准备简历文件…");

    try {
      const file = await dataUrlToFile(filePart.url, filePart.filename);

      // Step 1: parse resume profile (skip if we already analyzed while picking JD)
      let parseResult: ParseResult | null = cachedParseResultRef.current;
      let streamError: string | null = null;

      if (!parseResult) {
        setPhase("parsing");
        setProgressStatus("正在解析简历…");
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";

        const parseForm = new FormData();
        parseForm.append("resume", file);
        const parseResponse = await fetch("/api/interview/parse-resume", {
          body: parseForm,
          method: "POST",
          signal: abortController.signal,
        });

        if (!parseResponse.ok) {
          const errBody = (await parseResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errBody?.error ?? "简历解析失败");
        }

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
      }

      const { resumeProfile } = parseResult as ParseResult;

      // 身份维度查重：失败时静默继续。命中时缓存状态、暂停流程，等用户决策。
      // Identity dedup; on failure proceed silently. On hit, stash state and
      // wait for the user to "继续解析" or "取消上传".
      try {
        const { matches } = await fetchInterviewDedup({
          email: resumeProfile.email,
          name: resumeProfile.name,
          phone: resumeProfile.phone,
        });
        if (matches.length > 0) {
          cachedParseResultRef.current = parseResult;
          pendingResumeFileRef.current = file;
          pendingJobDescriptionIdRef.current = jobDescriptionId;
          setDedupMatches(matches);
          setPhase("idle");
          setProgressStatus("");
          setProgressTools([]);
          setPartialFields([]);
          accumulatedTextRef.current = "";
          // 主动 abort 当前 controller — 用户点"继续解析"时会用新的 controller。
          // Abort the current controller; "继续解析" allocates a fresh one.
          abortControllerRef.current = null;
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

      // oxlint-disable-next-line no-use-before-define -- runQuestionsAndSave is declared just below; hoisting via function declaration.
      await runQuestionsAndSave(
        file,
        parseResult as ParseResult,
        jobDescriptionId,
        abortController,
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "入库失败");
      cachedParseResultRef.current = null;
      resetProgress();
    } finally {
      // 走到查重 pause 分支时已主动设为 null；此处仅在尚未清理时收尾。
      // The dedup-pause branch already nulls the ref; this is a no-op fallthrough.
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }

  // oxlint-disable-next-line complexity -- Mirrors the original Step 2 + Step 3 sequence; extracted so the dedup-paused path can resume it.
  async function runQuestionsAndSave(
    file: File,
    parseResult: ParseResult,
    jobDescriptionId: string,
    existingController?: AbortController,
  ) {
    const abortController = existingController ?? new AbortController();
    abortControllerRef.current = abortController;
    const { fileName, resumeProfile } = parseResult;

    try {
      // Step 2: stream generate interview questions
      setPhase("generating");
      setProgressStatus("正在生成面试题…");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";

      const questionsResponse = await fetch("/api/interview/generate-questions", {
        body: JSON.stringify({ resumeProfile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!questionsResponse.ok) {
        const errBody = (await questionsResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errBody?.error ?? "面试题生成失败");
      }

      let questions: InterviewQuestion[] | null = null;
      let streamError: string | null = null;

      await readNdjsonStream<AnalysisStreamEvent>(
        questionsResponse,
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

      // Step 3: persist the studio interview record
      setPhase("saving");
      setProgressStatus("正在写入简历库…");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";

      const resumePayload: ResumeAnalysisResult = {
        fileName,
        interviewQuestions: questions ?? [],
        resumeProfile,
      };

      const saveForm = new FormData();
      saveForm.append("candidateName", resumeProfile.name || "未命名候选人");
      saveForm.append("candidateEmail", resumeProfile.email ?? "");
      saveForm.append("candidatePhone", resumeProfile.phone ?? "");
      saveForm.append("targetRole", resumeProfile.targetRoles[0] ?? "");
      saveForm.append("notes", "");
      saveForm.append("status", "ready");
      saveForm.append(
        "scheduleEntries",
        JSON.stringify([
          { allowTextInput: false, notes: "", roundLabel: "一面", scheduledAt: "", sortOrder: 0 },
        ]),
      );
      saveForm.append("jobDescriptionId", jobDescriptionId);
      saveForm.append("resume", file);
      saveForm.append("resumePayload", JSON.stringify(resumePayload));

      const saveResponse = await fetch("/api/studio/interviews", {
        body: saveForm,
        method: "POST",
        signal: abortController.signal,
      });

      const savedPayload = (await saveResponse.json().catch(() => null)) as
        | StudioInterviewRecord
        | { error?: string }
        | null;

      if (!saveResponse.ok || !savedPayload || "error" in savedPayload) {
        throw new Error(
          savedPayload && "error" in savedPayload ? (savedPayload.error ?? "保存失败") : "保存失败",
        );
      }

      const record = savedPayload as StudioInterviewRecord;
      onImported(filePart.id, record.id);
      toast.success("简历已加入简历库");
      cachedParseResultRef.current = null;
      resetProgress();
      setDetailRecordId(record.id);
      setDetailOpen(true);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "入库失败");
      cachedParseResultRef.current = null;
      resetProgress();
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }

  function handleDedupContinue() {
    const file = pendingResumeFileRef.current;
    const parseResult = cachedParseResultRef.current;
    const jobDescriptionId = pendingJobDescriptionIdRef.current;
    setDedupMatches(null);
    pendingResumeFileRef.current = null;
    pendingJobDescriptionIdRef.current = null;
    if (file && parseResult && jobDescriptionId) {
      void runQuestionsAndSave(file, parseResult, jobDescriptionId);
    }
  }

  async function analyzeAndMatchJd() {
    if (!filePart.url || !filePart.filename) {
      return;
    }

    const abortController = new AbortController();
    matchAbortControllerRef.current = abortController;
    setIsAnalyzingMatch(true);
    setMatchReason(null);

    try {
      const file = await dataUrlToFile(filePart.url, filePart.filename);

      const parseForm = new FormData();
      parseForm.append("resume", file);
      const parseResponse = await fetch("/api/interview/parse-resume", {
        body: parseForm,
        method: "POST",
        signal: abortController.signal,
      });

      if (!parseResponse.ok) {
        const errBody = (await parseResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "简历解析失败");
      }

      let parseResult: ParseResult | null = null;
      let streamError: string | null = null;

      await readNdjsonStream<AnalysisStreamEvent>(
        parseResponse,
        (event) => {
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

      cachedParseResultRef.current = parseResult;

      const matchResponse = await rpc.api.interview["match-job-description"].$post(
        { json: { resumeProfile: (parseResult as ParseResult).resumeProfile } },
        { init: { signal: abortController.signal } },
      );

      if (!matchResponse.ok) {
        // Fall back to no preselection — user can still pick manually.
        return;
      }

      const matchPayload = (await matchResponse.json().catch(() => null)) as {
        matchedId?: string | null;
        reason?: string | null;
      } | null;

      if (matchPayload?.matchedId) {
        setSelectedJdId(matchPayload.matchedId);
        setJdError(undefined);
        setMatchReason(matchPayload.reason ?? null);
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      // Non-fatal — dialog still lets the user pick manually.
      toast.error(error instanceof Error ? error.message : "简历预分析失败");
    } finally {
      matchAbortControllerRef.current = null;
      setIsAnalyzingMatch(false);
    }
  }

  function handleButtonClick() {
    if (importedInterviewId) {
      setDetailRecordId(importedInterviewId);
      setDetailOpen(true);
      return;
    }
    setSelectedJdId("");
    setJdError(undefined);
    setMatchReason(null);
    cachedParseResultRef.current = null;
    setIsPickingJd(true);
  }

  function handleCancelAnalysis() {
    matchAbortControllerRef.current?.abort();
    matchAbortControllerRef.current = null;
    setIsAnalyzingMatch(false);
  }

  function handlePickDialogOpenChange(open: boolean) {
    setIsPickingJd(open);
    if (!open) {
      handleCancelAnalysis();
    }
  }

  function handleConfirmImport() {
    if (isAnalyzingMatch) {
      return;
    }
    if (!selectedJdId) {
      setJdError("请选择在招岗位");
      return;
    }
    setJdError(undefined);
    setIsPickingJd(false);
    void runImport(selectedJdId);
  }

  function handleSelectJd(next: string) {
    setSelectedJdId(next);
    if (next) {
      setJdError(undefined);
    }
  }

  return (
    <>
      <Button
        className={cn(
          "h-8 shrink-0 gap-1.5",
          importedInterviewId &&
            "border-emerald-200/80 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-600/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
          className,
        )}
        disabled={isImporting}
        onClick={handleButtonClick}
        size="sm"
        type="button"
        variant="outline"
      >
        {renderImportButtonContent({ importedInterviewId, isImporting })}
      </Button>

      <JdPickModal
        filename={filePart.filename}
        isAnalyzingMatch={isAnalyzingMatch}
        jdError={jdError}
        matchReason={matchReason}
        onAnalyze={() => void analyzeAndMatchJd()}
        onCancelAnalyze={handleCancelAnalysis}
        onConfirm={handleConfirmImport}
        onOpenChange={handlePickDialogOpenChange}
        onSelectChange={handleSelectJd}
        open={isPickingJd}
        selectedJdId={selectedJdId}
      />

      <ImportProgressModal
        dedupMatches={dedupMatches}
        filename={filePart.filename}
        onCancel={handleCancel}
        onDedupContinue={handleDedupContinue}
        open={isImporting}
        partialFields={partialFields}
        phase={phase}
        progressStatus={progressStatus}
        progressTools={progressTools}
      />

      <InterviewDetailDialog
        onOpenChange={setDetailOpen}
        onUpdated={() => {
          if (importedInterviewId && !detailRecordId) {
            return;
          }
          if (detailRecordId === null && importedInterviewId) {
            onMissing?.(filePart.id);
          }
        }}
        open={detailOpen}
        recordId={detailRecordId}
      />
    </>
  );
}
