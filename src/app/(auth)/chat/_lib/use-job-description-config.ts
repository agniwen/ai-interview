"use client";

/**
 * 「岗位描述（JD）」状态切片：聚焦在选择 / 派生文本 / 弹窗开关上。
 * Job-description (JD) state slice — focused on selection, derived text, and dialog toggle.
 *
 * 把它从 chat-page-client 抽出来后，主组件不再需要直接管理 JD 弹窗与配置；同时
 * 文本派生与标签计算也只发生在一处，避免重复 memoize。
 *
 * Extracting this slice keeps the main chat shell from babysitting JD dialog state
 * and centralises text / label derivation so it doesn't get re-implemented elsewhere.
 */

import { useCallback, useState } from "react";
import { deriveJobDescriptionText, getJobDescriptionLabel } from "@/lib/job-description-config";
import type { JobDescriptionConfig } from "@/lib/job-description-config";

export interface UseJobDescriptionConfigResult {
  config: JobDescriptionConfig | null;
  setConfig: (next: JobDescriptionConfig | null) => void;
  text: string;
  label: string | null;
  hasJobDescription: boolean;
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  openDialog: () => void;
  save: (next: JobDescriptionConfig | null) => void;
  clear: () => void;
}

export function useJobDescriptionConfig(
  initial: JobDescriptionConfig | null = null,
): UseJobDescriptionConfigResult {
  const [config, setConfig] = useState<JobDescriptionConfig | null>(() => initial);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const text = deriveJobDescriptionText(config);
  const label = getJobDescriptionLabel(config);

  const openDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);
  const save = useCallback((next: JobDescriptionConfig | null) => {
    setConfig(next);
  }, []);
  const clear = useCallback(() => {
    setConfig(null);
  }, []);

  return {
    clear,
    config,
    hasJobDescription: text.length > 0,
    isDialogOpen,
    label,
    openDialog,
    save,
    setConfig,
    setIsDialogOpen,
    text,
  };
}
