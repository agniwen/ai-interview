"use client";

import { IconDatabase, IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import type { ResumePoolScope, ResumeUploadBatchDedupPolicy } from "@arc/db-schema/schema";
import { resumePoolScopeMeta } from "@arc/shared/resume-pool";
import type {
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";

import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { TimeDisplay } from "@/components/features/display/time-display";
import { ResumeDedupMatchList } from "@/components/features/resume/resume-dedup-overlay";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { importResumePoolItem, isApiError } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

import {
  buildJdOptions,
  getCandidateTitle,
  normalizeScope,
  toResumeDedupMatches,
  useJobDescriptions,
} from "./resume-pool-page-model";

const StudioPersonDetailDialog = lazy(async () => {
  const detailDialog = await import("@/components/features/studio/studio-person-detail-dialog");
  return { default: detailDialog.StudioPersonDetailDialog };
});

export function SelectResumePoolScopeDialog({
  defaultScope,
  onOpenChange,
  onSelected,
  open,
}: {
  defaultScope: ResumePoolScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelected: (scope: ResumePoolScope) => void;
}) {
  const [scope, setScope] = useState<ResumePoolScope>(defaultScope);

  useEffect(() => {
    if (open) {
      setScope(defaultScope);
    }
  }, [defaultScope, open]);

  return (
    <Modal
      footer={
        <>
          <Button size="lg" onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button
            size="lg"
            onClick={() => {
              onOpenChange(false);
              onSelected(scope);
            }}
          >
            下一步
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="sm"
      title="选择归属范围"
    >
      <RadioGroup
        className="grid grid-cols-2 gap-2"
        onValueChange={(value) => setScope(normalizeScope(value))}
        value={scope}
      >
        {(["private", "public"] as const).map((item) => (
          <FieldLabel className="w-full rounded-md border p-3" key={item}>
            <RadioGroupItem value={item} />
            <span>{resumePoolScopeMeta[item].label}</span>
          </FieldLabel>
        ))}
      </RadioGroup>
    </Modal>
  );
}

export function PrivateResumePoolUploadPolicyDialog({
  fileCount,
  onConfirmed,
  onOpenChange,
  open,
}: {
  fileCount: number;
  open: boolean;
  onConfirmed: (dedupPolicy: ResumeUploadBatchDedupPolicy) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      description="命中疑似重复时仍会加入私有简历，并在列表中标记“疑似重复”。"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button onClick={() => onConfirmed("skip")}>开始上传 ({fileCount})</Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="sm"
      title="查重处理"
    >
      <p className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
        所有简历都会被保留；系统会把疑似重复关系记录到简历上。
      </p>
    </Modal>
  );
}

export function ImportResumePoolDialog({
  item,
  onImported,
  onOpenChange,
}: {
  item: ResumePoolListRecord | null;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const slug = useWorkspaceSlug();
  const { data: jobDescriptions = [] } = useJobDescriptions(slug);
  const [mode, setMode] = useState<"none" | "bind">("bind");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [duplicates, setDuplicates] = useState<ResumePoolImportDuplicateResult | null>(null);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const isReimport = Boolean(item?.importedResumeRecordId);
  const importedRecords = item?.importedRecords ?? [];
  const candidateTitle = item ? getCandidateTitle(item) : "";

  useEffect(() => {
    if (!item) {
      setMode("bind");
      setJobDescriptionId("");
      setDuplicates(null);
      setDetailRecordId(null);
      return;
    }
    const canUseSourceJd =
      item.jobDescriptionId && jobDescriptions.some((jd) => jd.id === item.jobDescriptionId);
    setMode("bind");
    setJobDescriptionId(canUseSourceJd ? (item.jobDescriptionId ?? "") : "");
    setDuplicates(null);
  }, [item, jobDescriptions]);

  const mutation = useMutation({
    mutationFn: async (dedupPolicy: "check" | "force") => {
      if (!item) {
        throw new Error("请选择要入库的简历");
      }
      return await importResumePoolItem(slug, item.id, {
        dedupPolicy,
        jobDescriptionId: mode === "bind" ? jobDescriptionId : null,
        jobDescriptionMode: mode,
        reimport: isReimport,
      });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        const payload = error.payload as ResumePoolImportDuplicateResult | null;
        if (payload?.status === "duplicate_found") {
          setDuplicates(payload);
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : "入库失败");
    },
    onSuccess: (result) => {
      if (result.status === "duplicate_found") {
        setDuplicates(result);
        return;
      }
      toast.success(isReimport ? "已再次入库到招聘台" : "已入库到招聘台");
      onImported();
      onOpenChange(false);
    },
  });

  const bindInvalid = mode === "bind" && !jobDescriptionId;
  const { isPending } = mutation;
  let dialogDescription: string | undefined;
  if (item) {
    dialogDescription = isReimport ? "已在招聘台，是否再次入库。" : candidateTitle;
  }

  return (
    <>
      <Modal
        dismissible={!isPending}
        footer={
          <>
            <Button disabled={isPending} onClick={() => onOpenChange(false)} variant="outline">
              取消
            </Button>
            <Button
              disabled={isPending || bindInvalid}
              onClick={() => mutation.mutate(isReimport ? "force" : "check")}
            >
              {isPending ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconDatabase className="size-4" />
              )}
              {isReimport ? "确认再次入库" : "确认入库"}
            </Button>
          </>
        }
        onOpenChange={(next) => {
          if (!next && isPending) {
            return;
          }
          onOpenChange(next);
        }}
        open={item !== null}
        size="md"
        title={isReimport ? "再次入库到招聘台" : "入库到招聘台"}
        description={dialogDescription}
      >
        <div className="flex flex-col gap-5">
          {isReimport && importedRecords.length > 0 ? (
            <Field>
              <FieldLabel>已入库记录</FieldLabel>
              <FieldContent>
                <div className="flex flex-col gap-2">
                  {importedRecords.map((record) => (
                    <Button
                      aria-label={`查看已入库记录 ${record.resumeRecordId}`}
                      className="h-auto w-full justify-between py-3"
                      key={record.resumeRecordId}
                      onClick={() => setDetailRecordId(record.resumeRecordId)}
                      type="button"
                      variant="outline"
                    >
                      <span className="min-w-0 text-left">
                        <span className="block truncate">{candidateTitle}</span>
                        <span className="mt-0.5 block text-muted-foreground text-xs font-normal">
                          {formatResumeRecordDisplayId(record.resumeRecordId)}
                          {" · "}
                          <TimeDisplay as="span" value={record.importedAt} />
                        </span>
                      </span>
                      <IconExternalLink data-icon="inline-end" />
                    </Button>
                  ))}
                </div>
              </FieldContent>
            </Field>
          ) : null}
          <Field>
            <FieldLabel>关联岗位</FieldLabel>
            <FieldContent>
              <RadioGroup
                className="grid grid-cols-2 gap-2"
                disabled={isPending}
                onValueChange={(value) => setMode(value === "bind" ? "bind" : "none")}
                value={mode}
              >
                <FieldLabel className="w-full rounded-md border p-3">
                  <RadioGroupItem value="bind" />
                  <span>绑定岗位</span>
                </FieldLabel>
                <FieldLabel className="w-full rounded-md border p-3">
                  <RadioGroupItem value="none" />
                  <span>不绑定岗位</span>
                </FieldLabel>
              </RadioGroup>
            </FieldContent>
          </Field>
          {mode === "bind" ? (
            <Field data-invalid={bindInvalid ? true : undefined}>
              <FieldLabel htmlFor="resume-pool-import-jd">在招岗位</FieldLabel>
              <FieldContent>
                <SearchableSelect
                  disabled={isPending}
                  id="resume-pool-import-jd"
                  invalid={bindInvalid}
                  onChange={(next) => setJobDescriptionId(next ?? "")}
                  options={buildJdOptions(jobDescriptions)}
                  placeholder="请选择在招岗位"
                  searchPlaceholder="搜索岗位..."
                  value={jobDescriptionId || null}
                />
              </FieldContent>
            </Field>
          ) : null}
        </div>
      </Modal>
      <AlertDialog onOpenChange={(open) => !open && setDuplicates(null)} open={duplicates !== null}>
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>招聘台中可能已有相同候选人</AlertDialogTitle>
            <AlertDialogDescription>
              系统会基于工作经历、项目经历、技能和岗位画像的语义相似度判断风险。
              请根据判断依据确认是否为同一候选人。确认后会继续创建一条新的招聘台记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ResumeDedupMatchList matches={toResumeDedupMatches(duplicates)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                setDuplicates(null);
                mutation.mutate("force");
              }}
            >
              仍然入库
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {detailRecordId ? (
        <Suspense fallback={null}>
          <StudioPersonDetailDialog
            mode="resume"
            onOpenChange={(open) => {
              if (!open) {
                setDetailRecordId(null);
              }
            }}
            open={true}
            recordId={detailRecordId}
          />
        </Suspense>
      ) : null}
    </>
  );
}
