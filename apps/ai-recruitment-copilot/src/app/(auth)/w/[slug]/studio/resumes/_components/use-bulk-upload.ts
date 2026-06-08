"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  cancelBulkResumeBatch,
  createBulkResumeBatch,
  getBulkResumeBatchDetail,
  resumeBulkResumeBatch,
  uploadResumeForBulk,
} from "@/lib/client/api/endpoints/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  CreateBulkResumeBatchInput,
} from "@arc/shared/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

export type BulkUploadPhase =
  | "idle"
  | "uploading"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled";

export interface BulkUploadState {
  phase: BulkUploadPhase;
  detail: BulkResumeBatchDetailDto | null;
  /** 上传阶段每个文件的状态，按用户传入 files 的 index 索引。 Upload-phase status per file, indexed by the position in the user-supplied files array. */
  uploadStatus: ("pending" | "uploaded" | "failed")[];
  /** 上传阶段对应的原始文件名，索引与 uploadStatus 对齐。 Original file names captured at start; aligned with uploadStatus. */
  uploadFileNames: string[];
  uploadError: string | null;
}

type StartConfig = Omit<CreateBulkResumeBatchInput, "files">;

const LIST_INVALIDATE_THROTTLE_MS = 600;
const POLL_INTERVAL_MS = 1500;

interface UseBulkUploadOptions {
  onBatchQueued?: (detail: BulkResumeBatchDetailDto) => void;
  onRecordsChanged?: () => void;
}

export function useBulkUpload({ onBatchQueued, onRecordsChanged }: UseBulkUploadOptions = {}) {
  const slug = useWorkspaceSlug();
  const qc = useQueryClient();
  const [state, setState] = useState<BulkUploadState>({
    detail: null,
    phase: "idle",
    uploadError: null,
    uploadFileNames: [],
    uploadStatus: [],
  });
  const abortRef = useRef(false);
  const lastInvalidateRef = useRef(0);

  const invalidateThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastInvalidateRef.current < LIST_INVALIDATE_THROTTLE_MS) {
      return;
    }
    lastInvalidateRef.current = now;
    void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
  }, [qc]);

  const pollLoop = useCallback(
    async (batchId: string) => {
      abortRef.current = false;
      setState((s) => ({ ...s, phase: "processing" }));
      while (!abortRef.current) {
        try {
          // oxlint-disable-next-line promise/avoid-new -- Browser polling needs a timer promise.
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, POLL_INTERVAL_MS);
          });
          if (abortRef.current) {
            return;
          }
          const detail = await getBulkResumeBatchDetail(slug, batchId);
          setState((prev) => ({ ...prev, detail }));
          invalidateThrottled();
          if (detail.batch.status === "completed") {
            setState((s) => ({ ...s, phase: "completed" }));
            void qc.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
            void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
            onRecordsChanged?.();
            return;
          }
          if (detail.batch.status === "cancelled") {
            setState((s) => ({ ...s, phase: "cancelled" }));
            void qc.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
            return;
          }
        } catch (error) {
          console.error("[bulk-upload] polling failed:", error);
          setState((s) => ({ ...s, phase: "paused" }));
          return;
        }
      }
    },
    [slug, qc, invalidateThrottled, onRecordsChanged],
  );

  const start = useCallback(
    async (files: File[], config: StartConfig) => {
      setState({
        detail: null,
        phase: "uploading",
        uploadError: null,
        uploadFileNames: files.map((f) => f.name),
        uploadStatus: files.map(() => "pending"),
      });
      const descriptors: ({
        contentHash: string;
        storageKey: string;
        originalFileName: string;
        fileSize: number;
      } | null)[] = files.map(() => null);
      let nextIndex = 0;
      const POOL = 4;

      // 将单文件上传逻辑提取为独立函数，避免在 while 循环内声明引用 idx 的闭包。
      // Extract per-file upload logic as a standalone function to avoid closures
      // referencing loop variables (no-loop-func).
      const uploadOneFile = async (idx: number) => {
        const file = files[idx];
        try {
          const d = await uploadResumeForBulk(slug, file);
          descriptors[idx] = {
            contentHash: d.contentHash,
            fileSize: d.fileSize,
            originalFileName: d.originalFileName,
            storageKey: d.storageKey,
          };
          setState((s) => {
            const next = [...s.uploadStatus];
            next[idx] = "uploaded";
            return { ...s, uploadStatus: next };
          });
        } catch (error) {
          setState((s) => {
            const next = [...s.uploadStatus];
            next[idx] = "failed";
            return {
              ...s,
              uploadError: error instanceof Error ? error.message : "上传失败",
              uploadStatus: next,
            };
          });
          throw error;
        }
      };

      async function worker() {
        while (true) {
          const idx = nextIndex;
          nextIndex += 1;
          if (idx >= files.length) {
            return;
          }
          await uploadOneFile(idx);
        }
      }
      try {
        await Promise.all(Array.from({ length: Math.min(POOL, files.length) }, worker));
      } catch {
        setState((s) => ({ ...s, phase: "idle" }));
        return;
      }
      const ready = descriptors.filter((d): d is NonNullable<typeof d> => d !== null);
      try {
        const detail = await createBulkResumeBatch(slug, { ...config, files: ready });
        setState((s) => ({ ...s, detail, phase: "processing" }));
        void qc.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
        void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
        onBatchQueued?.(detail);
        void pollLoop(detail.batch.id);
      } catch (error) {
        setState((s) => ({
          ...s,
          phase: "idle",
          uploadError: error instanceof Error ? error.message : "创建批次失败",
        }));
      }
    },
    [slug, qc, pollLoop, onBatchQueued],
  );

  const resume = useCallback(
    async (batchId: string) => {
      const detail = await resumeBulkResumeBatch(slug, batchId);
      setState({
        detail,
        phase: "processing",
        uploadError: null,
        uploadFileNames: [],
        uploadStatus: [],
      });
      void pollLoop(batchId);
    },
    [slug, pollLoop],
  );

  const cancel = useCallback(async () => {
    if (!state.detail) {
      return;
    }
    abortRef.current = true;
    const detail = await cancelBulkResumeBatch(slug, state.detail.batch.id);
    setState((s) => ({ ...s, detail, phase: "cancelled" }));
    void qc.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
    void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
  }, [slug, state.detail, qc]);

  const abort = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, phase: "paused" }));
    void qc.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
  }, [qc, slug]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({
      detail: null,
      phase: "idle",
      uploadError: null,
      uploadFileNames: [],
      uploadStatus: [],
    });
  }, []);

  return { abort, cancel, reset, resume, start, state };
}
