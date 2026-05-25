"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";
import { useStore, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CandidateFormFields } from "@/components/candidate-form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  fetchStudioInterviewRound,
  fetchStudioResume,
  resetStudioInterviewRound,
  updateStudioInterviewRound,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";
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
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // 拉取当前记录详情，open + recordId 同时为真才触发。
  // Fetch the existing record; only enabled when the dialog is open and has a target id.
  const query = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchStudioResume(slug, recordId as string),
    queryKey: ["studio-resumes", slug, "edit-detail", recordId] as const,
    staleTime: 0,
  });

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      if (!recordId) {
        return;
      }
      const formData = new FormData();
      formData.append("candidateName", value.candidateName);
      formData.append("candidateEmail", value.candidateEmail);
      formData.append("candidatePhone", value.candidatePhone);
      formData.append("targetRole", value.targetRole);
      formData.append("jobDescriptionId", value.jobDescriptionId);
      formData.append("notes", value.notes);
      if (resumeFile) {
        formData.append("resume", resumeFile);
      }

      try {
        await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes/${recordId}`, {
          body: formData,
          method: "PATCH",
        });
        toast.success("已保存");
        onUpdated?.();
        onOpenChange(false);
        setResumeFile(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    },
    validators: { onSubmit: resumeLibraryFormSchema },
  });

  // 详情加载完成后回填表单；query.data 引用变更即触发。
  // Hydrate form once the detail resolves; keyed on query.data reference change.
  useEffect(() => {
    if (!query.data) {
      return;
    }
    form.reset({
      candidateEmail: query.data.candidateEmail ?? "",
      candidateName: query.data.candidateName,
      candidatePhone: query.data.candidatePhone ?? "",
      jobDescriptionId: query.data.jobDescriptionId ?? "",
      notes: query.data.notes ?? "",
      targetRole: query.data.targetRole ?? "",
    });
    // form 实例在渲染间稳定，此处仅依赖 query.data 的引用变化。
    // form instance is stable across renders; only depend on query.data identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <Modal
      footer={
        <>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isSubmitting} form="resume-edit-form" type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="xl"
      title="编辑简历"
    >
      <form
        className="space-y-5"
        id="resume-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <CandidateFormFields
          disabled={isSubmitting}
          existingResumeFileName={query.data?.resumeFileName ?? null}
          form={form}
          onResumeFileChange={setResumeFile}
          resumeFile={resumeFile}
          resumeFilePlaceholder="未上传 PDF，点击选择文件"
        />
      </form>
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
}: Omit<StudioPersonEditDialogProps, "mode">) {
  const slug = useWorkspaceSlug();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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

  // 当前轮次状态决定 allowTextInput 是否可改 + 重置按钮是否展示。
  // The current round status gates whether allowTextInput is editable and
  // whether the reset button is visible.
  const isRoundCompleted = round?.status === "completed";
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
        scheduledAt: formValues.scheduledAt || null,
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
    <Modal
      description="编辑轮次排期、文本输入设置和备注。状态由系统流转，只读展示；候选人基础信息请在简历库编辑。"
      footer={
        isLoading ? undefined : (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {isRoundCompleted ? (
              <Button
                disabled={isResetting || isSubmitting}
                onClick={() => void handleReset()}
                type="button"
                variant="outline"
              >
                {isResetting ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : (
                  <RotateCcwIcon className="size-3.5" />
                )}
                重置面试
              </Button>
            ) : null}
            <Button disabled={isSubmitting || isResetting} form="edit-round-form" type="submit">
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
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
        <div className="flex min-h-[240px] items-center justify-center text-muted-foreground text-sm">
          正在加载轮次数据...
        </div>
      ) : (
        <form className="space-y-5" id="edit-round-form" onSubmit={(e) => void handleSubmit(e)}>
          {/* 候选人字段说明横幅 / Banner explaining where to edit candidate fields */}
          <p className="text-muted-foreground text-sm">
            候选人身份字段（姓名、邮箱、电话、岗位、JD、备注、简历）请到简历库编辑。
          </p>

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
              onChange={(e) => setFormValues((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              type="datetime-local"
              value={formValues.scheduledAt}
            />
          </div>

          {/* 允许文本输入 / Allow text input — 已结束的轮次不允许修改 */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
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
          </div>

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
  );
}

// ---------------------------------------------------------------------------
// Public dispatcher — defined last so both body components are in scope.
// 公开分发入口 — 定义在两个 body 组件之后，确保引用合法。
// ---------------------------------------------------------------------------

/**
 * 统一的候选人记录编辑对话框，mode="resume" 编辑简历库，mode="interview" 编辑 AI 面试。
 * Unified edit dialog: mode="resume" edits a resume library record,
 * mode="interview" edits an AI interview record.
 */
export function StudioPersonEditDialog(props: StudioPersonEditDialogProps) {
  if (props.mode === "resume") {
    return <ResumeEditBody {...props} />;
  }
  return <InterviewEditBody {...props} />;
}
