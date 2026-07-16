"use client";

import { IconArrowBackUp, IconLoader2, IconPencil } from "@tabler/icons-react";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import { useStore, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CandidateFormFields } from "@/components/features/candidate/candidate-form-fields";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  fetchStudioInterviewRound,
  fetchStudioResume,
  resetStudioInterviewRound,
  updateStudioInterviewRound,
} from "@/lib/client/api";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  canEditResumeRecord,
  createResumeLibraryFormValues,
  getResumeActionLockedReason,
  resumeLibraryEditFormSchema,
} from "@arc/shared/studio-resumes";
import {
  getScheduleEntryDateValue,
  scheduleEntryStatusMeta,
} from "@arc/db-schema/studio-interviews";

// 统一编辑对话框 props，通过 mode 分发到简历或面试模式。
// Unified edit dialog props; dispatches to resume or interview body via mode.
interface StudioPersonEditDialogProps {
  mode: "resume" | "interview";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 要编辑的记录 ID，null 时不执行查询。Record id to edit; null skips the query. */
  recordId: string | null;
  /** 保存成功后回调。Callback on success. */
  onUpdated?: () => void;
  /** 面试模式下打开候选人资料编辑。Open candidate profile editing from interview mode. */
  onEditResumeRecord?: (recordId: string) => void;
}

function ResumeEditSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="flex flex-col gap-2" key={index}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Card className="gap-0 rounded-xl py-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getFormErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && "message" in error) {
    const { message } = error as { message?: unknown };
    return typeof message === "string" ? message : null;
  }
  return null;
}

function getFirstResumeEditErrorMessage(meta: Record<string, { errors?: unknown[] }>) {
  const fieldOrder = [
    "candidateName",
    "candidateEmail",
    "candidatePhone",
    "targetRole",
    "jobDescriptionId",
    "resumeEvaluationStatus",
    "hrResumeAssessment",
  ];
  for (const field of fieldOrder) {
    const message = getFormErrorMessage(meta[field]?.errors?.[0]);
    if (message) {
      return message;
    }
  }
  return "请检查简历信息后再保存";
}

function createResumeEditFormValues(
  detail: ResumeLibraryDetail | null | undefined,
): ReturnType<typeof createResumeLibraryFormValues> {
  if (!detail) {
    return createResumeLibraryFormValues();
  }

  return {
    candidateEmail: detail.candidateEmail ?? "",
    candidateName: detail.candidateName,
    candidatePhone: detail.candidatePhone ?? "",
    hrResumeAssessment: detail.hrResumeAssessment ?? "",
    jobDescriptionId: detail.jobDescriptionId ?? "",
    notes: detail.notes ?? "",
    resumeEvaluationStatus: detail.resumeEvaluationStatus ?? "unreviewed",
    targetRole: detail.targetRole ?? "",
  };
}

function InterviewEditSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Card className="gap-0 rounded-lg py-0">
        <CardContent className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-11" />
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resume body — mirrors the old EditResumeDialog verbatim.
// 简历编辑体 — 与原 EditResumeDialog 逻辑完全一致。
// ---------------------------------------------------------------------------

function ResumeEditBody({
  open,
  onOpenChange,
  recordId,
  onUpdated,
}: Omit<StudioPersonEditDialogProps, "mode">) {
  const slug = useWorkspaceSlug();
  const [hydratedFormKey, setHydratedFormKey] = useState<string | null>(null);

  // 拉取当前记录详情，open + recordId 同时为真才触发。
  // Fetch the existing record; only enabled when the dialog is open and has a target id.
  const query = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchStudioResume(slug, recordId as string),
    queryKey: ["studio-resumes", slug, "edit-detail", recordId] as const,
    staleTime: 0,
  });
  const formDefaultValues = useMemo(() => createResumeEditFormValues(query.data), [query.data]);

  const form = useForm({
    defaultValues: formDefaultValues,
    onSubmit: async ({ value }) => {
      if (!recordId) {
        return;
      }
      if (query.data && !canEditResumeRecord(query.data.resumeParseStatus)) {
        toast.error(
          getResumeActionLockedReason(query.data.resumeParseStatus) ?? "当前简历暂不可编辑",
        );
        return;
      }
      // 编辑弹窗不再提交简历文件 / 系统评价（notes / resumeReview），服务端也会忽略这两项。
      // Edit dialog no longer submits resume file or system notes; backend ignores them too.
      const formData = new FormData();
      formData.append("candidateName", value.candidateName);
      formData.append("candidateEmail", value.candidateEmail);
      formData.append("candidatePhone", value.candidatePhone);
      formData.append("targetRole", value.targetRole);
      formData.append("jobDescriptionId", value.jobDescriptionId);
      formData.append("hrResumeAssessment", value.hrResumeAssessment);
      formData.append("resumeEvaluationStatus", value.resumeEvaluationStatus);

      try {
        await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes/${recordId}`, {
          body: formData,
          method: "PATCH",
        });
        toast.success("已保存");
        onUpdated?.();
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    },
    onSubmitInvalid: ({ formApi }) => {
      const meta = formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>;
      toast.error(getFirstResumeEditErrorMessage(meta));
    },
    validators: { onSubmit: resumeLibraryEditFormSchema },
  });

  // 详情加载完成后回填表单；query.data 引用变更即触发。
  // Hydrate form once the detail resolves; keyed on query.data reference change.
  useEffect(() => {
    if (!query.data) {
      form.reset(formDefaultValues);
      setHydratedFormKey(null);
      return;
    }
    const nextHydratedFormKey = `${query.data.id}:${query.data.updatedAt}`;
    form.reset(formDefaultValues);
    setHydratedFormKey(nextHydratedFormKey);
    // form 实例在渲染间稳定，此处仅依赖 query.data 的引用变化。
    // form instance is stable across renders; only depend on query.data identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDefaultValues, query.data]);

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  const queryFormKey = query.data ? `${query.data.id}:${query.data.updatedAt}` : null;
  const isFormHydrated = queryFormKey !== null && hydratedFormKey === queryFormKey;
  const lockedReason = query.data
    ? getResumeActionLockedReason(query.data.resumeParseStatus)
    : null;
  const isResumeLocked = lockedReason !== null;

  return (
    <Modal
      footer={
        <>
          <Button
            disabled={isSubmitting || query.isLoading}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={isSubmitting || query.isLoading || isResumeLocked}
            form="resume-edit-form"
            type="submit"
          >
            {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="xl"
      title="编辑简历"
    >
      {query.isLoading || !isFormHydrated ? (
        <ResumeEditSkeleton />
      ) : (
        <form
          className="space-y-5"
          id="resume-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {lockedReason ? (
            <Card className="gap-0 rounded-md py-0">
              <CardContent className="bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
                {lockedReason}
              </CardContent>
            </Card>
          ) : null}
          <CandidateFormFields
            candidateNamePlaceholder="请输入候选人姓名"
            disabled={isSubmitting || isResumeLocked}
            form={form}
            onResumeFileChange={(file) => {
              void file;
            }}
            requireCandidateName
            resumeFile={null}
            showResumeEvaluationStatus
            showResumeFile={false}
            showSystemNotes={false}
          />
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Interview body — 编辑单轮次的可编辑字段（scheduledAt / allowTextInput / notes / status）。
// Interview body — edits a single round's editable fields.
// recordId 在 mode=interview 时为 roundId。
// recordId is the roundId when mode=interview.
// ---------------------------------------------------------------------------

// 轮次表单值类型（status 在编辑弹窗内只读展示，不再纳入表单）。
// Round edit form values — status is now read-only display, not editable here.
interface InterviewRoundFormValues {
  scheduledAt: string;
  allowTextInput: boolean;
  notes: string;
}

function createInterviewRoundFormValues(
  round: StudioInterviewRoundDetail,
): InterviewRoundFormValues {
  return {
    allowTextInput: round.allowTextInput,
    notes: round.notes ?? "",
    scheduledAt: getScheduleEntryDateValue(round.scheduledAt) ?? "",
  };
}

function InterviewEditBody({
  open,
  onOpenChange,
  recordId,
  onUpdated,
  onEditResumeRecord,
}: Omit<StudioPersonEditDialogProps, "mode">) {
  const slug = useWorkspaceSlug();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // 拉取轮次详情，open + recordId 同时为真才触发。
  // Fetch round detail; only enabled when dialog is open with a target id.
  const {
    data: round,
    isLoading,
    refetch,
  } = useQuery({
    enabled: open && !!recordId,
    queryFn: () => fetchStudioInterviewRound(slug, recordId as string),
    queryKey: ["studio-interview-round-edit", slug, recordId],
    staleTime: 0,
  });

  // 表单默认值。Form default values.
  const [formValues, setFormValues] = useState<InterviewRoundFormValues>({
    allowTextInput: false,
    notes: "",
    scheduledAt: "",
  });

  // 详情加载完成后回填表单。Hydrate form once round detail resolves.
  useEffect(() => {
    if (!round) {
      return;
    }
    setFormValues(createInterviewRoundFormValues(round));
  }, [round]);

  // 当前轮次状态决定 allowTextInput 是否可改；AI 面试阶段内均可重置轮次。
  // The current round status gates whether allowTextInput is editable; reset
  // is available throughout the AI interview pipeline stage.
  const isRoundCompleted = round?.status === "completed";
  const canResetRound = round?.candidate.pipelineStage === "ai_interview";
  const statusMeta = round ? scheduleEntryStatusMeta[round.status] : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recordId) {
      return;
    }
    setIsSubmitting(true);
    try {
      await updateStudioInterviewRound(slug, recordId, {
        allowTextInput: formValues.allowTextInput,
        notes: formValues.notes,
        scheduledAt: dateTimeLocalInputToISOString(formValues.scheduledAt),
      });
      toast.success("已保存轮次");
      onUpdated?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset() {
    if (!recordId || isResetting) {
      return;
    }
    setResetConfirmOpen(false);
    setIsResetting(true);
    try {
      await resetStudioInterviewRound(slug, recordId);
      toast.success("轮次已重置为待开始");
      onUpdated?.();
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <>
      <Modal
        description="编辑轮次排期、文本输入设置和备注。状态由系统流转，只读展示；候选人基础信息请在招聘台编辑。"
        footer={
          isLoading ? undefined : (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {canResetRound ? (
                <Button
                  disabled={isResetting || isSubmitting}
                  onClick={() => setResetConfirmOpen(true)}
                  type="button"
                  variant="outline"
                >
                  {isResetting ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconArrowBackUp className="size-3.5" />
                  )}
                  重置面试
                </Button>
              ) : null}
              <Button disabled={isSubmitting || isResetting} form="edit-round-form" type="submit">
                {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
                保存更新
              </Button>
            </div>
          )
        }
        onOpenChange={onOpenChange}
        open={open}
        size="md"
        title="编辑面试轮次"
      >
        {isLoading ? (
          <InterviewEditSkeleton />
        ) : (
          <form className="space-y-5" id="edit-round-form" onSubmit={(e) => void handleSubmit(e)}>
            {/* 候选人字段说明横幅 / Banner explaining where to edit candidate fields */}
            <Card className="gap-0 rounded-lg py-0">
              <CardContent className="flex flex-col gap-3 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm leading-normal">
                  候选人身份字段、关联岗位、简历和简历评价统一在招聘台维护。
                </p>
                {round?.candidate.id ? (
                  <Button
                    className="shrink-0"
                    onClick={() => onEditResumeRecord?.(round.candidate.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <IconPencil className="size-3.5" />
                    编辑候选人资料
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            {/* 轮次概览：roundLabel 与状态并排，与详情弹窗的「轮次概览」保持视觉一致。
              Round overview — roundLabel + status side-by-side, mirroring the
              detail dialog's 轮次概览 card for UI consistency. */}
            {round ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{round.roundLabel}</span>
                {statusMeta ? <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge> : null}
              </div>
            ) : null}

            {/* 面试时间 / Scheduled time */}
            <div className="space-y-1.5">
              <Label htmlFor="round-scheduledAt">面试时间</Label>
              <Input
                id="round-scheduledAt"
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, scheduledAt: e.target.value }))
                }
                type="datetime-local"
                value={formValues.scheduledAt}
              />
            </div>

            {/* 允许文本输入 / Allow text input — 已结束的轮次不允许修改 */}
            <Card className="gap-0 rounded-lg py-0">
              <CardContent className="flex items-center justify-between px-3 py-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="round-allowTextInput">允许面试者文本输入</Label>
                  <p className="text-muted-foreground text-xs">
                    关闭时面试界面文字输入框被禁用，仅支持语音作答。已结束的轮次不可修改。
                  </p>
                </div>
                <Switch
                  checked={formValues.allowTextInput}
                  disabled={isRoundCompleted}
                  id="round-allowTextInput"
                  onCheckedChange={(checked) =>
                    setFormValues((prev) => ({ ...prev, allowTextInput: checked }))
                  }
                />
              </CardContent>
            </Card>

            {/* 备注 / Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="round-notes">备注</Label>
              <Textarea
                id="round-notes"
                maxLength={1000}
                onChange={(e) => setFormValues((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="可填写面试安排备注..."
                rows={3}
                value={formValues.notes}
              />
            </div>
          </form>
        )}
      </Modal>
      <AlertDialog onOpenChange={setResetConfirmOpen} open={resetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置这轮 AI 面试？</AlertDialogTitle>
            <AlertDialogDescription>
              轮次会回到待开始状态，当前会话锚点和题目快照会重新生成，候选人需要重新进入面试。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReset()}>确认重置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public dispatcher — defined last so both body components are in scope.
// 公开分发入口 — 定义在两个 body 组件之后，确保引用合法。
// ---------------------------------------------------------------------------

/**
 * 统一的候选人记录编辑对话框，mode="resume" 编辑招聘台，mode="interview" 编辑 AI 面试。
 * Unified edit dialog: mode="resume" edits a resume library record,
 * mode="interview" edits an AI interview record.
 */
export function StudioPersonEditDialog(props: StudioPersonEditDialogProps) {
  if (props.mode === "resume") {
    return <ResumeEditBody {...props} />;
  }
  return <InterviewEditBody {...props} />;
}
