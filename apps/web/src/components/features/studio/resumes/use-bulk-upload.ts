"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelBulkResumeBatch,
  createBulkResumeBatch,
  getBulkResumeBatchDetail,
  resumeBulkResumeBatch,
  uploadResumeForBulk,
} from "@/lib/client/api/endpoints/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeUploadFileDescriptor,
  CreateBulkResumeBatchInput,
} from "@app/shared/bulk-resume-upload";
import { ApiError, safeApiErrorMessage } from "@/lib/client/api/errors";
import { invalidateStudioResumeListQueries } from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  parseUploadError,
  isRetryableUploadError,
  isUploadAccessError,
  retryBulkUploadRequest,
} from "./bulk-upload-retry";

type BulkUploadPhase =
  | "idle"
  | "uploading"
  | "creating"
  | "upload_failed"
  | "partial_failure"
  | "batch_failed"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled";
type UploadStatus = "pending" | "uploading" | "retrying" | "uploaded" | "failed" | "cancelled";
export interface BulkUploadState {
  phase: BulkUploadPhase;
  detail: BulkResumeBatchDetailDto | null;
  uploadStatus: UploadStatus[];
  uploadFileNames: string[];
  uploadErrors: (string | null)[];
  uploadAttempts: number[];
  uploadError: string | null;
  canRetry: boolean;
  queuedCount: number;
}
type StartConfig = Omit<CreateBulkResumeBatchInput, "files" | "requestId">;
interface UploadFile {
  file: File;
  requestId: string;
  descriptor: BulkResumeUploadFileDescriptor | null;
  status: UploadStatus;
  error: string | null;
  attempts: number;
  retryable: boolean;
  queued: boolean;
}
interface UploadSession {
  slug: string;
  files: UploadFile[];
  config: StartConfig;
  controller: AbortController;
  latestBatch?: BulkResumeBatchDetailDto;
  pendingBatch?: { input: CreateBulkResumeBatchInput; indices: number[] };
}
const initialState = (): BulkUploadState => ({
  canRetry: false,
  detail: null,
  phase: "idle",
  queuedCount: 0,
  uploadAttempts: [],
  uploadError: null,
  uploadErrors: [],
  uploadFileNames: [],
  uploadStatus: [],
});
export interface BulkUploadDependencies {
  cancelBulkResumeBatch: typeof cancelBulkResumeBatch;
  createBulkResumeBatch: typeof createBulkResumeBatch;
  getBulkResumeBatchDetail: typeof getBulkResumeBatchDetail;
  resumeBulkResumeBatch: typeof resumeBulkResumeBatch;
  slug: string;
  uploadResumeForBulk: typeof uploadResumeForBulk;
}
export interface UseBulkUploadOptions {
  dependencies?: BulkUploadDependencies;
  onBatchQueued?: (detail: BulkResumeBatchDetailDto, summary: { failedCount: number }) => void;
  onRecordsChanged?: () => void;
}
function uploadErrorMessage(error: Error): string {
  if (isUploadAccessError(error)) {
    return error instanceof ApiError && error.status === 401
      ? "登录已失效，请重新登录后重试。"
      : "没有上传权限，请联系管理员。";
  }
  return safeApiErrorMessage(
    error instanceof Error ? error.message : null,
    error instanceof ApiError ? error.status : 0,
    "上传失败，请重试。",
  );
}
async function uploadFiles(
  session: UploadSession,
  dependencies: BulkUploadDependencies,
  publish: () => void,
) {
  const { controller } = session;
  const candidates = session.files.filter(
    (item) => !item.descriptor && (item.status === "pending" || item.retryable),
  );
  let nextIndex = 0;
  let accessError: Error | undefined;
  async function worker() {
    while (!controller.signal.aborted) {
      const item = candidates[nextIndex];
      nextIndex += 1;
      if (!item) {
        return;
      }
      try {
        const descriptor = await retryBulkUploadRequest(
          (signal) =>
            dependencies.uploadResumeForBulk(dependencies.slug, item.file, {
              requestId: item.requestId,
              signal,
            }),
          controller.signal,
          (attempt) => {
            item.status = attempt === 1 ? "uploading" : "retrying";
            item.attempts = attempt;
            item.error = null;
            publish();
          },
        );
        if (controller.signal.aborted) {
          return;
        }
        item.descriptor = descriptor;
        item.status = "uploaded";
        item.retryable = false;
      } catch (error) {
        const uploadError = parseUploadError(error);
        if (controller.signal.aborted) {
          return;
        }
        item.status = "failed";
        item.error = uploadErrorMessage(uploadError);
        item.retryable =
          isRetryableUploadError(uploadError) ||
          isUploadAccessError(uploadError) ||
          (uploadError instanceof ApiError && uploadError.status >= 500);
        if (isUploadAccessError(uploadError)) {
          accessError = uploadError;
          controller.abort();
        }
      }
      publish();
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker));
  if (accessError) {
    for (const item of session.files) {
      if (["pending", "uploading", "retrying"].includes(item.status)) {
        item.status = "failed";
        item.error = uploadErrorMessage(accessError);
        item.retryable = true;
      }
    }
  }
  return accessError;
}

function submittedPhase(
  failedCount: number,
  status: BulkResumeBatchDetailDto["batch"]["status"],
): BulkUploadPhase {
  if (failedCount > 0) {
    return "partial_failure";
  }
  if (status === "completed" || status === "cancelled") {
    return status;
  }
  return "processing";
}
function closedPhase(phase: BulkUploadPhase): BulkUploadPhase {
  if (phase === "uploading") {
    return "cancelled";
  }
  return phase === "processing" ? "paused" : phase;
}
function submissionFailure(
  error: Error,
): Pick<BulkUploadState, "canRetry" | "phase" | "uploadError"> {
  const rejected =
    error instanceof ApiError && [400, 404, 409, 413, 415, 422].includes(error.status);
  return {
    canRetry: !rejected,
    phase: rejected ? "upload_failed" : "batch_failed",
    uploadError: rejected
      ? `批次提交失败：${uploadErrorMessage(error)} 请结束本次上传后重新选择文件或岗位。`
      : `文件已上传，批次提交未确认：${uploadErrorMessage(error)} 已上传的文件会保留，重试不会重复上传。`,
  };
}
function settleFailedUploads(
  session: UploadSession,
  publish: (patch: Partial<BulkUploadState>) => void,
  pollLoop: (batchId: string) => Promise<void>,
) {
  const hasQueued = session.files.some((item) => item.queued);
  publish({
    phase: hasQueued ? "partial_failure" : "upload_failed",
    uploadError: hasQueued
      ? "本次重试未成功，已提交的文件不受影响，请查看失败原因。"
      : "没有文件上传成功，请查看各文件的失败原因。",
  });
  if (
    session.latestBatch &&
    !["completed", "cancelled"].includes(session.latestBatch.batch.status)
  ) {
    void pollLoop(session.latestBatch.batch.id);
  }
}
export function useBulkUploadWithDependencies({
  dependencies,
  onBatchQueued,
  onRecordsChanged,
}: UseBulkUploadOptions & { dependencies: BulkUploadDependencies }) {
  const {
    cancelBulkResumeBatch: cancelBatch,
    createBulkResumeBatch: createBatch,
    getBulkResumeBatchDetail: getDetail,
    resumeBulkResumeBatch: resumeBatch,
    slug,
  } = dependencies;
  const qc = useQueryClient();
  const [state, setState] = useState<BulkUploadState>(initialState);
  const [workspace, setWorkspace] = useState(slug);
  const sessionRef = useRef<UploadSession | null>(null);
  const pollTokenRef = useRef(0);
  const lastInvalidateRef = useRef(0);
  const submittingRef = useRef(false);
  useEffect(
    () => () => {
      sessionRef.current?.controller.abort();
      sessionRef.current = null;
      pollTokenRef.current += 1;
      submittingRef.current = false;
      lastInvalidateRef.current = 0;
    },
    [slug],
  );
  if (workspace !== slug) {
    setWorkspace(slug);
    setState(initialState());
  }

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["active-bulk-batches", slug] });
    void qc.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
    void invalidateStudioResumeListQueries(qc, slug);
  }, [qc, slug]);
  const pollLoop = useCallback(
    async (batchId: string) => {
      pollTokenRef.current += 1;
      const token = pollTokenRef.current;
      while (pollTokenRef.current === token) {
        try {
          // oxlint-disable-next-line promise/avoid-new -- Browser polling needs a timer promise.
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 1500);
          });
          if (pollTokenRef.current !== token) {
            return;
          }
          const detail = await getDetail(slug, batchId);
          if (pollTokenRef.current !== token) {
            return;
          }
          setState((prev) => ({ ...prev, detail }));
          if (Date.now() - lastInvalidateRef.current > 600) {
            lastInvalidateRef.current = Date.now();
            void invalidateStudioResumeListQueries(qc, slug);
          }
          if (detail.batch.status === "completed" || detail.batch.status === "cancelled") {
            setState((prev) => ({
              ...prev,
              phase: submittedPhase(
                prev.uploadStatus.filter((status) => status === "failed").length,
                detail.batch.status,
              ),
            }));
            invalidate();
            if (detail.batch.status === "completed") {
              onRecordsChanged?.();
            }
            return;
          }
        } catch {
          if (pollTokenRef.current === token) {
            setState((prev) => ({
              ...prev,
              phase: prev.uploadStatus.includes("failed") ? "partial_failure" : "paused",
              uploadError: "暂时无法更新解析进度，后台任务会继续处理。",
            }));
          }
          return;
        }
      }
    },
    [getDetail, slug, qc, invalidate, onRecordsChanged],
  );

  const runSession = useCallback(
    async (session: UploadSession) => {
      const { controller } = session;
      const isCurrent = () => sessionRef.current === session && session.controller === controller;
      const publish = (patch: Partial<BulkUploadState> = {}) => {
        if (!isCurrent()) {
          return;
        }
        setState((prev) => ({
          ...prev,
          canRetry:
            Boolean(session.pendingBatch) ||
            session.files.some((item) => item.status === "failed" && item.retryable),
          queuedCount: session.files.filter((item) => item.queued).length,
          uploadAttempts: session.files.map((item) => item.attempts),
          uploadErrors: session.files.map((item) => item.error),
          uploadFileNames: session.files.map((item) => item.file.name),
          uploadStatus: session.files.map((item) => item.status),
          ...patch,
        }));
      };
      if (!session.pendingBatch) {
        publish({ phase: "uploading", uploadError: null });
        const accessError = await uploadFiles(session, dependencies, () => {
          if (!controller.signal.aborted) {
            publish();
          }
        });
        if (!isCurrent()) {
          return;
        }
        if (accessError) {
          publish({ phase: "upload_failed", uploadError: uploadErrorMessage(accessError) });
          return;
        }
        if (controller.signal.aborted) {
          return;
        }
        const indices = session.files.flatMap((item, index) =>
          item.descriptor && !item.queued ? [index] : [],
        );
        if (indices.length === 0) {
          settleFailedUploads(session, publish, pollLoop);
          return;
        }
        session.pendingBatch = {
          indices,
          input: {
            ...session.config,
            files: indices.flatMap((index) => session.files[index].descriptor ?? []),
            requestId: crypto.randomUUID(),
          },
        };
      }
      if (controller.signal.aborted) {
        return;
      }
      const submission = session.pendingBatch;
      publish({ phase: "creating", uploadError: null });
      submittingRef.current = true;
      try {
        // Once submitted, wait for its receipt: aborting this POST cannot undo server-side writes.
        const detail = await retryBulkUploadRequest(
          (signal) => createBatch(slug, submission.input, { signal }),
          controller.signal,
        );
        if (!isCurrent() || controller.signal.aborted) {
          return;
        }
        for (const index of submission.indices) {
          session.files[index].queued = true;
        }
        session.pendingBatch = undefined;
        session.latestBatch = detail;
        const failedCount = session.files.filter((item) => item.status === "failed").length;
        publish({
          detail,
          phase: submittedPhase(failedCount, detail.batch.status),
          uploadError: null,
        });
        invalidate();
        if (detail.batch.status !== "cancelled") {
          onBatchQueued?.(detail, { failedCount });
        }
        if (detail.batch.status === "completed") {
          onRecordsChanged?.();
        } else if (detail.batch.status !== "cancelled") {
          void pollLoop(detail.batch.id);
        }
      } catch (error) {
        if (isCurrent() && !controller.signal.aborted) {
          const failure = submissionFailure(parseUploadError(error));
          if (!failure.canRetry) {
            session.pendingBatch = undefined;
          }
          publish(failure);
        }
      } finally {
        if (isCurrent()) {
          submittingRef.current = false;
        }
      }
    },
    [dependencies, createBatch, slug, invalidate, onBatchQueued, pollLoop, onRecordsChanged],
  );

  const start = useCallback(
    async (files: File[], config: StartConfig) => {
      if (submittingRef.current || sessionRef.current?.pendingBatch || files.length === 0) {
        return;
      }
      sessionRef.current?.controller.abort();
      pollTokenRef.current += 1;
      const session: UploadSession = {
        config,
        controller: new AbortController(),
        files: files.map((file) => ({
          attempts: 0,
          descriptor: null,
          error: null,
          file,
          queued: false,
          requestId: crypto.randomUUID(),
          retryable: true,
          status: "pending",
        })),
        slug,
      };
      sessionRef.current = session;
      setState(initialState());
      await runSession(session);
    },
    [runSession, slug],
  );
  const retryFailed = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.slug !== slug || submittingRef.current || state.phase === "uploading") {
      return;
    }
    session.controller.abort();
    session.controller = new AbortController();
    pollTokenRef.current += 1;
    await runSession(session);
  }, [runSession, slug, state.phase]);

  const resume = useCallback(
    async (batchId: string) => {
      if (
        submittingRef.current ||
        sessionRef.current?.pendingBatch ||
        state.canRetry ||
        state.phase === "uploading"
      ) {
        return;
      }
      sessionRef.current?.controller.abort();
      sessionRef.current = null;
      pollTokenRef.current += 1;
      const token = pollTokenRef.current;
      const detail = await resumeBatch(slug, batchId);
      if (token !== pollTokenRef.current) {
        return;
      }
      setState({ ...initialState(), detail, phase: "processing" });
      invalidate();
      void pollLoop(batchId);
    },
    [resumeBatch, slug, invalidate, pollLoop, state.canRetry, state.phase],
  );
  const view = useCallback(
    async (batchId: string) => {
      if (
        submittingRef.current ||
        sessionRef.current?.pendingBatch ||
        state.canRetry ||
        state.phase === "uploading"
      ) {
        return;
      }
      sessionRef.current?.controller.abort();
      sessionRef.current = null;
      pollTokenRef.current += 1;
      const token = pollTokenRef.current;
      const detail = await getDetail(slug, batchId);
      if (token !== pollTokenRef.current) {
        return;
      }
      setState({
        ...initialState(),
        detail,
        phase:
          detail.batch.status === "completed" || detail.batch.status === "cancelled"
            ? detail.batch.status
            : "paused",
      });
    },
    [getDetail, slug, state.canRetry, state.phase],
  );
  const cancel = useCallback(async (): Promise<string | null> => {
    if (submittingRef.current || sessionRef.current?.pendingBatch) {
      return null;
    }
    pollTokenRef.current += 1;
    const session = sessionRef.current;
    session?.controller.abort();
    if (session && ["uploading", "upload_failed", "partial_failure"].includes(state.phase)) {
      session.files = session.files.map((item) =>
        ["pending", "uploading", "retrying"].includes(item.status)
          ? { ...item, status: "cancelled" }
          : item,
      );
      setState((prev) => ({
        ...prev,
        canRetry: false,
        phase: "cancelled",
        uploadStatus: session.files.map((item) => item.status),
      }));
      return session.files.some((item) => item.queued)
        ? "已停止上传，已提交的文件继续后台解析"
        : "已停止上传";
    }
    if (state.detail) {
      const token = pollTokenRef.current;
      const detail = await cancelBatch(slug, state.detail.batch.id);
      if (token !== pollTokenRef.current) {
        return null;
      }
      setState((prev) => ({ ...prev, canRetry: false, detail, phase: "cancelled" }));
      invalidate();
      return "批次已取消";
    }
    setState((prev) => ({ ...prev, canRetry: false, phase: "cancelled" }));
    return "已停止上传";
  }, [state.detail, state.phase, cancelBatch, slug, invalidate]);
  const abort = useCallback(() => {
    pollTokenRef.current += 1;
    if (submittingRef.current) {
      return;
    }
    sessionRef.current?.controller.abort();
    setState((prev) => ({
      ...prev,
      canRetry: prev.phase === "uploading" ? false : prev.canRetry,
      phase: closedPhase(prev.phase),
      uploadStatus:
        prev.phase === "uploading"
          ? prev.uploadStatus.map((status) =>
              ["pending", "uploading", "retrying"].includes(status) ? "cancelled" : status,
            )
          : prev.uploadStatus,
    }));
  }, []);
  const reset = useCallback(() => {
    if (submittingRef.current || sessionRef.current?.pendingBatch) {
      return;
    }
    sessionRef.current?.controller.abort();
    sessionRef.current = null;
    pollTokenRef.current += 1;
    setState(initialState());
  }, []);
  return { abort, cancel, reset, resume, retryFailed, start, state, view };
}
export function useBulkUpload(options: UseBulkUploadOptions = {}) {
  const slug = useWorkspaceSlug();
  return useBulkUploadWithDependencies({
    ...options,
    dependencies: options.dependencies ?? {
      cancelBulkResumeBatch,
      createBulkResumeBatch,
      getBulkResumeBatchDetail,
      resumeBulkResumeBatch,
      slug,
      uploadResumeForBulk,
    },
  });
}
