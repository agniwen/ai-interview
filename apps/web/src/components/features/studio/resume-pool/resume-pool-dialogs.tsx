"use client";

import { IconDatabase, IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import type {
  ResumePoolInitialRecruitmentStage,
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";

import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { getMemberInitials } from "@/components/data-grid/cells/member-cell";
import { TimeDisplay } from "@/components/features/display/time-display";
import { ResumeDedupMatchList } from "@/components/features/resume/resume-dedup-overlay";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { StudioPersonDetailDialog } from "../studio-person-detail-dialog";

import {
  buildJdOptions,
  getCandidateTitle,
  toResumeDedupMatches,
  useJobDescriptions,
} from "./resume-pool-page-model";

interface StudioPersonDetailProps {
  onOpenChange: (open: boolean) => void;
  recordId: string;
}

export interface ImportResumePoolDialogDependencies {
  importResumePoolItem: typeof importResumePoolItem;
  isApiError: typeof isApiError;
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
  renderStudioPersonDetail: (props: StudioPersonDetailProps) => ReactNode;
  useJobDescriptionOptions: (slug: string) => {
    data?: { description?: string; label: string; value: string }[];
  };
  useWorkspaceSlug: () => string;
}

const defaultImportResumePoolDialogDependencies: ImportResumePoolDialogDependencies = {
  importResumePoolItem,
  isApiError,
  notifyError: (message) => toast.error(message),
  notifySuccess: (message) => toast.success(message),
  renderStudioPersonDetail: ({ onOpenChange, recordId }) => (
    <StudioPersonDetailDialog
      mode="resume"
      onOpenChange={onOpenChange}
      open={true}
      recordId={recordId}
    />
  ),
  useJobDescriptionOptions: (slug) => {
    const { data } = useJobDescriptions(slug);
    return { data: data ? buildJdOptions(data) : undefined };
  },
  useWorkspaceSlug,
};

function getAvailableSourceJobDescriptionId(
  item: ResumePoolListRecord | null,
  options: { value: string }[],
) {
  const sourceId = item?.jobDescriptionId;
  if (!sourceId) {
    return "";
  }
  return options.some((option) => option.value === sourceId) ? sourceId : "";
}

function getImportDialogDescription(
  item: ResumePoolListRecord | null,
  isReimport: boolean,
  candidateTitle: string,
) {
  if (!item) {
    return;
  }
  return isReimport ? "已存在招聘记录，是否再次创建。" : candidateTitle;
}

interface ImportResumePoolDialogState {
  detailRecordId: string | null;
  duplicates: ResumePoolImportDuplicateResult | null;
  initialRecruitmentStage: ResumePoolInitialRecruitmentStage;
  itemId: string | null;
  jobDescriptionId: string;
  jobDescriptionTouched: boolean;
  mode: "none" | "bind";
}

function createImportResumePoolDialogState(itemId: string | null): ImportResumePoolDialogState {
  return {
    detailRecordId: null,
    duplicates: null,
    initialRecruitmentStage: "screening",
    itemId,
    jobDescriptionId: "",
    jobDescriptionTouched: false,
    mode: "bind",
  };
}

function useImportResumePoolDialogState(itemId: string | null, sourceJobDescriptionId: string) {
  const [state, setState] = useState(() => createImportResumePoolDialogState(itemId));
  let ownedState = state;
  if (state.itemId !== itemId) {
    ownedState = createImportResumePoolDialogState(itemId);
    setState(ownedState);
  }

  function update(patch: Partial<ImportResumePoolDialogState>) {
    setState((current) => (current.itemId === itemId ? { ...current, ...patch, itemId } : current));
  }

  return {
    ...ownedState,
    jobDescriptionId: ownedState.jobDescriptionTouched
      ? ownedState.jobDescriptionId
      : sourceJobDescriptionId,
    update,
  };
}

export function ImportResumePoolDialog({
  dependencies = defaultImportResumePoolDialogDependencies,
  item,
  onImported,
  onOpenChange,
}: {
  dependencies?: ImportResumePoolDialogDependencies;
  item: ResumePoolListRecord | null;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const slug = dependencies.useWorkspaceSlug();
  const { data: jobDescriptionOptions = [] } = dependencies.useJobDescriptionOptions(slug);
  const isReimport = Boolean(item?.importedResumeRecordId);
  const importedRecords = item?.importedRecords ?? [];
  const candidateTitle = item ? getCandidateTitle(item) : "";
  const itemId = item?.id ?? null;
  const sourceJobDescriptionId = getAvailableSourceJobDescriptionId(item, jobDescriptionOptions);
  const {
    detailRecordId,
    duplicates,
    initialRecruitmentStage,
    jobDescriptionId,
    mode,
    update: updateDialogState,
  } = useImportResumePoolDialogState(itemId, sourceJobDescriptionId);

  const mutation = useMutation({
    mutationFn: async (dedupPolicy: "check" | "force") => {
      if (!item) {
        throw new Error("请选择要入库的简历");
      }
      return await dependencies.importResumePoolItem(slug, item.id, {
        dedupPolicy,
        initialRecruitmentStage: mode === "bind" ? initialRecruitmentStage : "screening",
        jobDescriptionId: mode === "bind" ? jobDescriptionId : null,
        jobDescriptionMode: mode,
        reimport: isReimport,
      });
    },
    onError: (error) => {
      if (dependencies.isApiError(error) && error.status === 409) {
        // SAFETY: this mutation's 409 response is the backend's duplicate-result DTO;
        // its status discriminator is checked before any duplicate details are consumed.
        const payload = error.payload as ResumePoolImportDuplicateResult | null;
        if (payload?.status === "duplicate_found") {
          updateDialogState({ duplicates: payload });
          return;
        }
      }
      dependencies.notifyError(error instanceof Error ? error.message : "创建招聘记录失败");
    },
    onSuccess: (result) => {
      if (result.status === "duplicate_found") {
        updateDialogState({ duplicates: result });
        return;
      }
      dependencies.notifySuccess(isReimport ? "已再次创建招聘记录" : "已创建招聘记录");
      onImported();
      onOpenChange(false);
    },
  });

  const bindInvalid = mode === "bind" && !jobDescriptionId;
  const { isPending } = mutation;
  const dialogDescription = getImportDialogDescription(item, isReimport, candidateTitle);

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
              {isReimport ? "确认再次创建" : "确认创建"}
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
        title={isReimport ? "再次创建招聘记录" : "创建招聘记录"}
        description={dialogDescription}
      >
        <div className="flex flex-col gap-5">
          {isReimport && importedRecords.length > 0 ? (
            <Field>
              <FieldLabel>已创建的招聘记录</FieldLabel>
              <FieldContent>
                <div className="flex flex-col gap-2">
                  {importedRecords.map((record) => {
                    const creatorName = record.creatorName?.trim() || "已删除用户";
                    return (
                      <Button
                        aria-label={`查看已创建的招聘记录 ${record.resumeRecordId}`}
                        className="h-auto w-full justify-between py-3"
                        key={record.resumeRecordId}
                        onClick={() => updateDialogState({ detailRecordId: record.resumeRecordId })}
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
                          <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs font-normal">
                            <Avatar
                              label={`${creatorName}的头像`}
                              seed={`creator:${record.creatorName || record.resumeRecordId}`}
                              size="sm"
                            >
                              {record.creatorImage ? (
                                <AvatarImage alt={creatorName} src={record.creatorImage} />
                              ) : null}
                              <AvatarFallback>
                                {getMemberInitials(record.creatorName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">创建人 {creatorName}</span>
                          </span>
                        </span>
                        <IconExternalLink data-icon="inline-end" />
                      </Button>
                    );
                  })}
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
                onValueChange={(value) =>
                  updateDialogState({ mode: value === "bind" ? "bind" : "none" })
                }
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
            <>
              <Field data-invalid={bindInvalid ? true : undefined}>
                <FieldLabel htmlFor="resume-pool-import-jd">在招岗位</FieldLabel>
                <FieldContent>
                  <SearchableSelect
                    disabled={isPending}
                    id="resume-pool-import-jd"
                    invalid={bindInvalid}
                    onChange={(next) =>
                      updateDialogState({
                        jobDescriptionId: next ?? "",
                        jobDescriptionTouched: true,
                      })
                    }
                    options={jobDescriptionOptions}
                    placeholder="请选择在招岗位"
                    searchPlaceholder="搜索岗位..."
                    value={jobDescriptionId || null}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>进入招聘流程</FieldLabel>
                <FieldContent>
                  <RadioGroup
                    className="grid grid-cols-3 gap-2"
                    disabled={isPending}
                    onValueChange={(value) => {
                      if (
                        value === "screening" ||
                        value === "ai_interview" ||
                        value === "human_interview"
                      ) {
                        updateDialogState({ initialRecruitmentStage: value });
                      }
                    }}
                    value={initialRecruitmentStage}
                  >
                    <FieldLabel className="w-full rounded-md border p-3">
                      <RadioGroupItem value="screening" />
                      <span>简历筛选</span>
                    </FieldLabel>
                    <FieldLabel className="w-full rounded-md border p-3">
                      <RadioGroupItem value="ai_interview" />
                      <span>AI 面试</span>
                    </FieldLabel>
                    <FieldLabel className="w-full rounded-md border p-3">
                      <RadioGroupItem value="human_interview" />
                      <span>真人复面</span>
                    </FieldLabel>
                  </RadioGroup>
                </FieldContent>
              </Field>
            </>
          ) : null}
        </div>
      </Modal>
      <AlertDialog
        onOpenChange={(open) => !open && updateDialogState({ duplicates: null })}
        open={duplicates !== null}
      >
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
                updateDialogState({ duplicates: null });
                mutation.mutate("force");
              }}
            >
              仍然入库
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {detailRecordId
        ? dependencies.renderStudioPersonDetail({
            onOpenChange: (open) => {
              if (!open) {
                updateDialogState({ detailRecordId: null });
              }
            },
            recordId: detailRecordId,
          })
        : null}
    </>
  );
}
