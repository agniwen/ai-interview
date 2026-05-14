"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";
import type { ScheduleEntryStatus } from "@/lib/shared/studio-interviews";
import { useStore, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CandidateFormFields } from "@/components/candidate-form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  fetchStudioInterviewRound,
  fetchStudioResume,
  updateStudioInterviewRound,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";
import { getScheduleEntryDateValue, scheduleEntryStatusMeta } from "@/lib/shared/studio-interviews";

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
    <Modal onOpenChange={onOpenChange} open={open} size="md" title="编辑简历">
      <form
        className="space-y-5"
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

        <div className="flex justify-end gap-2 pt-2">
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </div>
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

// 轮次表单值类型。Round edit form values.
interface InterviewRoundFormValues {
  scheduledAt: string;
  allowTextInput: boolean;
  notes: string;
  status: ScheduleEntryStatus;
}

function createInterviewRoundFormValues(
  round: StudioInterviewRoundDetail,
): InterviewRoundFormValues {
  return {
    allowTextInput: round.allowTextInput,
    notes: round.notes ?? "",
    scheduledAt: getScheduleEntryDateValue(round.scheduledAt) ?? "",
    status: round.status,
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

  // 拉取轮次详情，open + recordId 同时为真才触发。
  // Fetch round detail; only enabled when dialog is open with a target id.
  const { data: round, isLoading } = useQuery({
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
    status: "pending",
  });

  // 详情加载完成后回填表单。Hydrate form once round detail resolves.
  useEffect(() => {
    if (!round) {
      return;
    }
    setFormValues(createInterviewRoundFormValues(round));
  }, [round]);

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
        status: formValues.status,
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

  return (
    <Modal
      description="编辑轮次排期、文本输入设置、备注和状态。候选人基础信息请在简历库编辑。"
      footer={
        isLoading ? undefined : (
          <Button disabled={isSubmitting} form="edit-round-form" type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            保存更新
          </Button>
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

          {/* 轮次标签（只读）/ Round label (read-only) */}
          {round?.roundLabel ? (
            <div className="space-y-1.5">
              <Label>轮次</Label>
              <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                {round.roundLabel}
              </p>
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

          {/* 状态 / Status */}
          <div className="space-y-1.5">
            <Label htmlFor="round-status">状态</Label>
            <Select
              onValueChange={(v) => {
                // Radix Select 可能在关闭时回调空串；只接受有效枚举值。
                // Radix Select may fire onValueChange("") on close — guard here.
                if (!v) {
                  return;
                }
                setFormValues((prev) => ({ ...prev, status: v as ScheduleEntryStatus }));
              }}
              value={formValues.status}
            >
              <SelectTrigger id="round-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(scheduleEntryStatusMeta).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 允许文本输入 / Allow text input */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="round-allowTextInput">允许面试者文本输入</Label>
              <p className="text-muted-foreground text-xs">
                关闭时面试界面文字输入框被禁用，仅支持语音作答。
              </p>
            </div>
            <Switch
              checked={formValues.allowTextInput}
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
