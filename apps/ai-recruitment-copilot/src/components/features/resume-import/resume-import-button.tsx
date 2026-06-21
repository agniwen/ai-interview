"use client";

// 一键入库：把 chat 中的简历 PDF 解析后写入简历库（resume-only，不生成面试题、
// 不创建排期）。「发起 AI 面试」改成在打开的简历详情弹窗里走 LaunchInterview
// Dialog —— 与简历库行菜单 / 详情入口完全同一套 UX。
//
// One-click import: parse the chat resume PDF and persist it to the resume
// library (no question generation, no schedule entries — those are deferred
// to the launch-interview flow). Launching an interview happens through the
// same LaunchInterviewDialog the resume library uses, opened from the resume
// detail dialog this button pops.

import type { FileUIPart } from "ai";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, DatabaseIcon, EyeIcon, LoaderCircleIcon } from "@/components/icons/hugeicons";
import { Suspense, lazy, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ImportProgressModal } from "@/components/features/resume-import/import-progress-modal";
import { JdPickModal } from "@/components/features/resume-import/jd-pick-modal";
import type {
  ImportPhase,
  ParseResult,
  PartialField,
  ProgressTool,
} from "@/components/features/resume-import/types";
import { dataUrlToFile, tryExtractPartialFields } from "@/components/features/resume-import/utils";
import { Button } from "@/components/ui/button";
import type { DedupMatchRecord } from "@/lib/client/api";
import { apiFetch, extractResumeDedupConflictMatches, fetchInterviewDedup } from "@/lib/client/api";
import {
  buildResumePayload,
  buildSaveOnlyResumeFormData,
  formValuesFromResumeProfile,
  matchJobDescriptionForResume,
  parseResumeFile,
} from "@/lib/client/resume-analysis";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@arc/shared/utils";

// 详情 / 发起弹窗只在需要时才挂载；动态加载省初始 bundle。
// Dynamically load both heavy dialogs — they only mount on user interaction.
const StudioPersonDetailDialog = lazy(async () => {
  const mod = await import("@/components/features/studio/studio-person-detail-dialog");
  return { default: mod.StudioPersonDetailDialog };
});

const LaunchInterviewDialog = lazy(async () => {
  const mod = await import("@/components/features/studio/resumes/launch-interview-dialog");
  return { default: mod.LaunchInterviewDialog };
});

// 「已入库」详情弹窗里的「编辑」按钮要打开这个简历编辑 dialog。chat 入库流程
// 不能让用户跳出去 /studio/resumes，所以这里跟 detail / launch 一样本地挂载。
// Resume-edit dialog opened from the detail dialog's "编辑" button. Mounted
// locally so the chat-side flow doesn't bounce users out to /studio/resumes.
const StudioPersonEditDialog = lazy(async () => {
  const mod = await import("@/components/features/studio/studio-person-edit-dialog");
  return { default: mod.StudioPersonEditDialog };
});

interface ResumeImportButtonProps {
  filePart: FileUIPart & { id: string };
  // 已导入的简历库行 id（旧字段名沿用，避免外部消费者再改一遍）。
  // Resume row id for this part if previously imported; field name kept for
  // compatibility with the existing chat layout state.
  importedInterviewId: string | null;
  /**
   * 当前对话已经选中的在招岗位 id —— 弹出入库弹窗时直接预选该岗位，避免用户再挑一次。
   * Currently-applied JD id in the chat; used to preselect the import dialog's
   * JD dropdown so the user doesn't have to pick again.
   */
  activeJobDescriptionId?: string | null;
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

// oxlint-disable-next-line complexity -- single button orchestrates analyze + dedup + save + open detail + launch interview.
export function ResumeImportButton({
  filePart,
  importedInterviewId,
  activeJobDescriptionId,
  onImported,
  onMissing: _onMissing,
  className,
}: ResumeImportButtonProps) {
  // chat layout 已在 WorkspaceSlugProvider 下,这里直接拿当前活跃工作区。
  // The chat layout already wraps everything in WorkspaceSlugProvider.
  const workspaceSlug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<ProgressTool[]>([]);
  const [partialFields, setPartialFields] = useState<PartialField[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  // 详情 dialog 里点"编辑"切到这个 state，触发本地 StudioPersonEditDialog 挂载。
  // Driven by the detail dialog's onEdit; null = closed.
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [launchingRecord, setLaunchingRecord] = useState<{
    id: string;
    candidateName: string | null;
  } | null>(null);
  const [interviewRoundDetailId, setInterviewRoundDetailId] = useState<string | null>(null);
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
  // 暂存语义查重命中时的状态：用户点"继续解析"才会真正进入 Step 2。
  // Cached state for the dedup-pause flow so "继续解析" can resume Step 2.
  const pendingResumeFileRef = useRef<File | null>(null);
  const pendingJobDescriptionIdRef = useRef<string | null>(null);

  const isImporting = phase !== "idle" || Boolean(dedupMatches);

  const invalidateLibraryCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
  }, [queryClient]);

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

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setPhase("preparing");
    setProgressStatus("准备简历文件…");

    try {
      const file = await dataUrlToFile(filePart.url, filePart.filename);

      // Step 1: parse resume profile (skip if we already analyzed while picking JD)
      let parseResult: ParseResult | null = cachedParseResultRef.current;

      if (!parseResult) {
        setPhase("parsing");
        setProgressStatus("正在解析简历…");
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";

        parseResult = await parseResumeFile(file, {
          onEvent: (event) => {
            handleStreamEvent(event);
          },
          signal: abortController.signal,
        });
      }

      const { resumeProfile } = parseResult as ParseResult;

      // 语义查重：失败时静默继续。命中时缓存状态、暂停流程，等用户决策。
      // Semantic dedup; on failure proceed silently. On hit, stash state and
      // wait for the user to continue or cancel.
      try {
        const dedupResult = await fetchInterviewDedup(
          workspaceSlug,
          {
            email: resumeProfile.email,
            name: resumeProfile.name,
            phone: resumeProfile.phone,
            resumeProfile,
          },
          { signal: abortController.signal },
        );
        const matches = dedupResult?.matches ?? [];
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
              ? `语义查重失败，已跳过：${error.message}`
              : "语义查重失败，已跳过",
          );
        }
      }

      // oxlint-disable-next-line no-use-before-define -- runSaveToLibrary is declared just below; hoisted via function declaration.
      await runSaveToLibrary(file, parseResult as ParseResult, jobDescriptionId, abortController);
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

  async function runSaveToLibrary(
    file: File,
    parseResult: ParseResult,
    jobDescriptionId: string,
    existingController?: AbortController,
    dedupPolicy: "check" | "force" = "check",
  ) {
    const abortController = existingController ?? new AbortController();
    abortControllerRef.current = abortController;
    const { fileName, resumeProfile } = parseResult;

    try {
      // 直接 POST /studio/resumes（save-only）：不生成面试题、不创建排期。
      // 后续「发起 AI 面试」由用户在简历详情弹窗里点按钮触发 LaunchInterviewDialog。
      //
      // Save-only: POST /studio/resumes; no questions, no schedule. Launching
      // the interview is deferred to the user clicking 「发起 AI 面试」 in the
      // resume detail dialog, which routes into LaunchInterviewDialog.
      setPhase("saving");
      setProgressStatus("正在写入简历库…");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";

      const resumePayload = buildResumePayload(fileName, resumeProfile);
      const record = await apiFetch<ResumeLibraryDetail>(`/api/w/${workspaceSlug}/studio/resumes`, {
        body: buildSaveOnlyResumeFormData(
          formValuesFromResumeProfile(resumeProfile, { jobDescriptionId }),
          file,
          resumePayload,
          { dedupPolicy },
        ),
        method: "POST",
        signal: abortController.signal,
      });
      invalidateLibraryCaches();
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
      const conflictMatches = extractResumeDedupConflictMatches(error);
      if (conflictMatches) {
        cachedParseResultRef.current = parseResult;
        pendingResumeFileRef.current = file;
        pendingJobDescriptionIdRef.current = jobDescriptionId;
        setDedupMatches(conflictMatches);
        setPhase("idle");
        setProgressStatus("");
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";
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
    const jobDescriptionId = pendingJobDescriptionIdRef.current ?? "";
    setDedupMatches(null);
    pendingResumeFileRef.current = null;
    pendingJobDescriptionIdRef.current = null;
    if (file && parseResult) {
      void runSaveToLibrary(file, parseResult, jobDescriptionId, undefined, "force");
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

      const parseResult = await parseResumeFile(file, { signal: abortController.signal });

      cachedParseResultRef.current = parseResult;

      const matchPayload = await matchJobDescriptionForResume(parseResult.resumeProfile, {
        signal: abortController.signal,
      });

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
    // 当前对话已设置的 JD 直接作为下拉默认值；没有就退化成空字符串让用户挑。
    // Preselect the chat's active JD when present; otherwise fall back to an
    // empty selection so the user picks manually (or hits "自动分析").
    setSelectedJdId(activeJobDescriptionId ?? "");
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

  // JD 选不选都行 —— save-only 接受空 jobDescriptionId，后续可以在简历库 / 发起
  // AI 面试时再补。
  // JD is optional: the save-only endpoint accepts an empty string; users can
  // attach a JD later from the resume library or the launch dialog.
  function handleConfirmImport() {
    if (isAnalyzingMatch) {
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

      {/* 入库后打开简历库详情弹窗（resume mode）。点「发起 AI 面试」会通过
          onLaunchInterview 把控制权交给本地 LaunchInterviewDialog，避免把用户
          从 chat 跳走到 /studio/resumes。
          Opens the resume-mode detail dialog. Clicking 「发起 AI 面试」 forwards
          to a locally mounted LaunchInterviewDialog so the user stays in chat. */}
      {detailOpen ? (
        <Suspense fallback={null}>
          <StudioPersonDetailDialog
            mode="resume"
            onEdit={(id) => {
              // 跟 resume-library-page 的处理对齐：关详情 dialog + 开编辑 dialog。
              // Detail.onEdit 之前没接，导致按钮哑火。
              // Mirrors resume-library-page: close detail → open edit. Detail.onEdit
              // wasn't wired here previously, which is why the button did nothing.
              setDetailOpen(false);
              setEditingRecordId(id);
            }}
            onLaunchInterview={({ id, candidateName }) => {
              setDetailOpen(false);
              setLaunchingRecord({ candidateName, id });
            }}
            onOpenChange={setDetailOpen}
            onUpdated={() => {
              invalidateLibraryCaches();
              // 简历从库里被删（fetchStudioResume → null）时这里没有直接信号，
              // 由简历库 DELETE 路由触发的 chat_conversation.resumeImports 清理兜底
              // （见 chat/dao/chat.ts removeImportedInterviewFromConversations）。
              // No direct 404 signal here; the chat-side "已入库" badge state is
              // swept server-side when the resume row is deleted (see
              // removeImportedInterviewFromConversations in chat/dao/chat.ts).
            }}
            open={detailOpen}
            recordId={detailRecordId}
          />
        </Suspense>
      ) : null}

      {editingRecordId === null ? null : (
        <Suspense fallback={null}>
          <StudioPersonEditDialog
            mode="resume"
            onOpenChange={(open) => !open && setEditingRecordId(null)}
            onUpdated={invalidateLibraryCaches}
            open={editingRecordId !== null}
            recordId={editingRecordId}
          />
        </Suspense>
      )}

      {launchingRecord === null ? null : (
        <Suspense fallback={null}>
          <LaunchInterviewDialog
            candidateName={launchingRecord.candidateName}
            onLaunched={(round: StudioInterviewRoundDetail) => {
              invalidateLibraryCaches();
              setInterviewRoundDetailId(round.id);
            }}
            onOpenChange={(open) => !open && setLaunchingRecord(null)}
            open={launchingRecord !== null}
            recordId={launchingRecord.id}
          />
        </Suspense>
      )}

      {interviewRoundDetailId === null ? null : (
        <Suspense fallback={null}>
          <StudioPersonDetailDialog
            mode="interview"
            onOpenChange={(open) => !open && setInterviewRoundDetailId(null)}
            onUpdated={invalidateLibraryCaches}
            open={interviewRoundDetailId !== null}
            recordId={interviewRoundDetailId}
          />
        </Suspense>
      )}
    </>
  );
}
