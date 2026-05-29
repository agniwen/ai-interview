"use client";

import { FileTextIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { JobDescriptionSelectField } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ResumeUploadBatchDedupPolicy, ResumeUploadBatchJdMode } from "@arc/db-schema/schema";

export interface BulkUploadConfirmConfig {
  jdMode: ResumeUploadBatchJdMode;
  jobDescriptionId: string | null;
  dedupPolicy: ResumeUploadBatchDedupPolicy;
}

interface Props {
  open: boolean;
  files: File[];
  onOpenChange: (open: boolean) => void;
  onConfirmed: (files: File[], config: BulkUploadConfirmConfig) => void;
  onRemoveFile: (index: number) => void;
}

// 格式化文件大小，返回人类可读的字符串。
// Format file size into a human-readable string.
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function BulkUploadConfirmDialog({
  files,
  onConfirmed,
  onOpenChange,
  onRemoveFile,
  open,
}: Props) {
  const [jdMode, setJdMode] = useState<ResumeUploadBatchJdMode>("bind");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [dedupPolicy, setDedupPolicy] = useState<ResumeUploadBatchDedupPolicy>("skip");

  // 必须选文件，且 bind 模式下必须选 JD 才能开始。
  // Must have files; in bind mode a JD must be selected.
  const canStart = files.length > 0 && (jdMode !== "bind" || jobDescriptionId.length > 0);

  function handleStart() {
    if (!canStart) {
      return;
    }
    onConfirmed(files, {
      dedupPolicy,
      jdMode,
      jobDescriptionId: jdMode === "bind" ? jobDescriptionId : null,
    });
  }

  return (
    <Modal
      description={`将一次性上传 ${files.length} 份 PDF，开始后逐份解析并入库；可随时关闭页面，下次回来继续。`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={!canStart} onClick={handleStart} type="button">
            开始上传 ({files.length})
          </Button>
        </div>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="md"
      title="批量上传简历"
    >
      <div className="space-y-6">
        {/* 文件清单 / File list */}
        <div>
          <Label className="mb-2 block text-sm">文件清单</Label>
          <Card className="gap-0 overflow-hidden rounded-md py-0">
            <CardContent className="p-0">
              <ul className="max-h-48 space-y-1 overflow-y-auto bg-muted/30 p-2 text-sm">
                {files.map((f, idx) => (
                  <li
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-background"
                    key={`${f.name}-${f.size}-${idx}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatSize(f.size)}
                      </span>
                    </span>
                    {files.length > 1 ? (
                      <button
                        aria-label="移除"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onRemoveFile(idx)}
                        type="button"
                      >
                        <XIcon className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* JD 关联模式 / Job description binding mode */}
        <div>
          <Label className="mb-2 block text-sm">岗位关联</Label>
          <RadioGroup onValueChange={(v) => setJdMode(v as ResumeUploadBatchJdMode)} value={jdMode}>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="jdMode-bind" value="bind" />
              <Label className="font-normal" htmlFor="jdMode-bind">
                绑定到某个岗位（所有简历都关联此岗位）
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="jdMode-auto" value="auto" />
              <Label className="font-normal" htmlFor="jdMode-auto">
                自动匹配岗位（每份简历由 AI 选最合适的在招岗位，耗时更长）
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="jdMode-none" value="none" />
              <Label className="font-normal" htmlFor="jdMode-none">
                不绑定岗位
              </Label>
            </div>
          </RadioGroup>
          {jdMode === "bind" ? (
            <div className="mt-3">
              <JobDescriptionSelectField onChange={setJobDescriptionId} value={jobDescriptionId} />
            </div>
          ) : null}
        </div>

        {/* 查重策略 / Deduplication policy */}
        <div>
          <Label className="mb-2 block text-sm">查重策略</Label>
          <RadioGroup
            onValueChange={(v) => setDedupPolicy(v as ResumeUploadBatchDedupPolicy)}
            value={dedupPolicy}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="dedup-skip" value="skip" />
              <Label className="font-normal" htmlFor="dedup-skip">
                跳过疑似重复（不创建新记录）
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="dedup-create" value="create" />
              <Label className="font-normal" htmlFor="dedup-create">
                照样创建（允许重复）
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </Modal>
  );
}
