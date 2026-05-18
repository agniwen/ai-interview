"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  cancelBulkResumeBatch,
  createBulkResumeBatch,
  processNextBulkResumeBatch,
  resumeBulkResumeBatch,
  uploadResumeForBulk,
} from "@/lib/client/api/endpoints/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  CreateBulkResumeBatchInput,
} from "@/lib/shared/bulk-resume-upload";
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
  uploadError: string | null;
}

type StartConfig = Omit<CreateBulkResumeBatchInput, "files">;

const LIST_INVALIDATE_THROTTLE_MS = 600;

export function useBulkUpload() {
  const slug = useWorkspaceSlug();
  const qc = useQueryClient();
  const [state, setState] = useState<BulkUploadState>({
    detail: null,
    phase: "idle",
    uploadError: null,
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

  const runLoop = useCallback(
    async (batchId: string) => {
      abortRef.current = false;
      setState((s) => ({ ...s, phase: "processing" }));
      while (!abortRef.current) {
        try {
          const res = await processNextBulkResumeBatch(slug, batchId);
          setState((prev) => {
            if (!prev.detail) {
              return { ...prev, detail: { batch: res.batch, items: [] } };
            }
            const items = prev.detail.items.map((it) =>
              res.item && it.id === res.item.id ? res.item : it,
            );
            return { ...prev, detail: { batch: res.batch, items } };
          });
          invalidateThrottled();
          if (res.done) {
            setState((s) => ({ ...s, phase: "completed" }));
            void qc.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
            void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
            return;
          }
          if (!res.item) {
            // No pending item but not done — caller should resume orphans.
            // 没有待处理项目但未完成 — 调用方应恢复孤立项。
            setState((s) => ({ ...s, phase: "paused" }));
            return;
          }
        } catch (error) {
          console.error("[bulk-upload] process-next failed:", error);
          setState((s) => ({ ...s, phase: "paused" }));
          return;
        }
      }
    },
    [slug, qc, invalidateThrottled],
  );

  const start = useCallback(
    async (files: File[], config: StartConfig) => {
      setState({
        detail: null,
        phase: "uploading",
        uploadError: null,
        uploadStatus: files.map(() => "pending"),
      });
      const descriptors: ({
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
        void runLoop(detail.batch.id);
      } catch (error) {
        setState((s) => ({
          ...s,
          phase: "idle",
          uploadError: error instanceof Error ? error.message : "创建批次失败",
        }));
      }
    },
    [slug, qc, runLoop],
  );

  const resume = useCallback(
    async (batchId: string) => {
      const detail = await resumeBulkResumeBatch(slug, batchId);
      setState({
        detail,
        phase: "processing",
        uploadError: null,
        uploadStatus: [],
      });
      void runLoop(batchId);
    },
    [slug, runLoop],
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
    setState({ detail: null, phase: "idle", uploadError: null, uploadStatus: [] });
  }, []);

  return { abort, cancel, reset, resume, start, state };
}
