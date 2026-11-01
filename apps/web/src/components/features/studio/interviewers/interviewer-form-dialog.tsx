"use client";

import { IconLoader2, IconPlus, IconSquare, IconVolume2 } from "@tabler/icons-react";
import type { DepartmentRecord } from "@app/shared/departments";
import type { InterviewerFormValues, InterviewerRecord } from "@app/shared/interviewers";
import { interviewerFormSchema } from "@app/shared/interviewers";
import {
  minimaxVoiceSchema,
  DEFAULT_MINIMAX_VOICE_ID,
  MINIMAX_INTERVIEWER_VOICES,
} from "@app/db-schema/minimax-voices";
import { rpc } from "@/lib/client/rpc";
import { runAsyncAction } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { toast } from "sonner";
import { z } from "zod";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";

import { LazyMarkdownEditor as MarkdownEditor } from "@/components/features/markdown-editor/lazy-markdown-editor";
import type { MinimaxVoiceId } from "@app/db-schema/minimax-voices";
import { DepartmentFormDialog } from "@/components/features/studio/departments/department-form-dialog";
import { EntityFormDialog } from "@/components/features/studio/entity-form-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useEntityForm } from "@/components/features/studio/entity-form";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";

const errorPayloadSchema = z.object({ error: z.string().optional() }).nullable();
const voicePreviewPayloadSchema = z
  .object({ error: z.string().optional(), url: z.string().optional() })
  .nullable();

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;
const PROMPT_MAX_LENGTH = 10_000;

function defaultValues(departmentId: string): InterviewerFormValues {
  return {
    departmentId,
    description: "",
    name: "",
    prompt: "",
    voice: DEFAULT_MINIMAX_VOICE_ID,
  };
}

function toFormValues(record: InterviewerRecord): InterviewerFormValues {
  return {
    departmentId: record.departmentId,
    description: record.description ?? "",
    name: record.name,
    prompt: record.prompt,
    voice: record.voice,
  };
}

function FieldSkeleton({ className }: { className: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-16" />
      <Skeleton className={className} />
    </div>
  );
}

/** 与表单字段同布局的加载骨架。Loading skeleton mirroring the form field layout. */
function InterviewerFormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FieldSkeleton className="h-9 w-full" />
        <FieldSkeleton className="h-9 w-full" />
      </div>
      <FieldSkeleton className="h-9 w-full" />
      <FieldSkeleton className="h-20 w-full" />
      <FieldSkeleton className="h-64 w-full" />
    </div>
  );
}

export function InterviewerFormDialog({
  open,
  onOpenChange,
  record,
  loading = false,
  departments,
  onDepartmentCreated,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewerRecord | null;
  /** 编辑详情加载中（弹窗已打开）。The edit detail is still loading behind the open dialog. */
  loading?: boolean;
  departments: DepartmentRecord[];
  /** 表单内新建部门后刷新部门列表。Refreshes the department list after an inline create. */
  onDepartmentCreated?: () => Promise<void> | void;
  onSaved: () => void;
}) {
  const slug = useWorkspaceSlug();
  const canCreateDepartment = useHasPermission("department", "create");
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const isEdit = record !== null || loading;
  const fallbackDepartmentId = departments[0]?.id ?? "";
  const noDepartments = departments.length === 0;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loadingPreviewVoice, setLoadingPreviewVoice] = useState<MinimaxVoiceId | null>(null);
  const [playingPreviewVoice, setPlayingPreviewVoice] = useState<MinimaxVoiceId | null>(null);

  const stopVoicePreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingPreviewVoice(null);
  }, []);

  useEffect(() => () => stopVoicePreview(), [stopVoicePreview]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      stopVoicePreview();
    }
    onOpenChange(next);
  }

  async function handlePreviewVoice(voice: MinimaxVoiceId) {
    if (playingPreviewVoice === voice) {
      stopVoicePreview();
      return;
    }

    stopVoicePreview();
    setLoadingPreviewVoice(voice);
    await runAsyncAction({
      cleanup: () => setLoadingPreviewVoice(null),
      onError: (error) => {
        stopVoicePreview();
        toast.error(error instanceof Error ? error.message : "试听音频播放失败");
      },
      operation: async () => {
        const response = await rpc.api.w[":slug"].studio.interviewers["voice-previews"].$post({
          json: { voice },
          param: { slug },
        });
        const rawPayload = await response.json().catch(() => null);
        const parsedPayload = voicePreviewPayloadSchema.safeParse(rawPayload);
        const payload = parsedPayload.success ? parsedPayload.data : null;
        if (!response.ok || !payload?.url) {
          throw new Error(payload?.error ?? "生成试听音频失败");
        }
        const audio = new Audio(payload.url);
        audioRef.current = audio;
        audio.addEventListener("ended", () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
            setPlayingPreviewVoice(null);
          }
        });
        setPlayingPreviewVoice(voice);
        await audio.play();
      },
    });
  }

  const buildValues = useCallback(
    () => (record ? toFormValues(record) : defaultValues(fallbackDepartmentId)),
    [fallbackDepartmentId, record],
  );

  const { form, isSubmitting } = useEntityForm<InterviewerFormValues>({
    buildValues,
    onSubmit: async (value) => {
      const body = {
        departmentId: value.departmentId,
        description: value.description?.trim() || "",
        name: value.name.trim(),
        prompt: value.prompt.trim(),
        voice: value.voice,
      };

      const response = record
        ? await rpc.api.w[":slug"].studio.interviewers[":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio.interviewers.$post({ json: body, param: { slug } });
      const rawPayload = await response.json().catch(() => null);
      const parsedPayload = errorPayloadSchema.safeParse(rawPayload);
      const payload = parsedPayload.success ? parsedPayload.data : null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "面试官 Agent 已更新" : "面试官 Agent 已创建");
      onSaved();
      onOpenChange(false);
    },
    // 详情加载完成后才视为打开，届时用记录重置表单。Reset with the record once it has loaded.
    open: open && !loading,
    schema: interviewerFormSchema,
  });

  async function handleDepartmentCreated({ id }: { id: string }) {
    await onDepartmentCreated?.();
    form.setFieldValue("departmentId", id);
  }

  return (
    <>
      <EntityFormDialog
        description="人设与音色将在面试开始时生效。"
        formId="interviewer-form"
        isEdit={isEdit}
        isSubmitting={isSubmitting}
        loading={loading}
        loadingSkeleton={<InterviewerFormSkeleton />}
        onOpenChange={handleOpenChange}
        onSubmit={async () => {
          await form.handleSubmit();
        }}
        open={open}
        size="xl"
        submitDisabled={noDepartments}
        title={isEdit ? "编辑面试官 Agent" : "创建面试官 Agent"}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="name">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                  <FieldLabel htmlFor={field.name}>
                    名称 <span className="text-destructive">*</span>
                  </FieldLabel>
                  <FieldContent className="gap-2">
                    <Input
                      aria-invalid={!!errors?.length}
                      id={field.name}
                      maxLength={NAME_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="如：技术面试官 · 后端方向"
                      value={field.state.value}
                    />
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="departmentId">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                  <FieldLabel htmlFor={field.name}>
                    所属部门 <span className="text-destructive">*</span>
                  </FieldLabel>
                  <FieldContent className="gap-2">
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          disabled={noDepartments}
                          id={field.name}
                          invalid={!!errors?.length}
                          onChange={(value) => field.handleChange(value ?? "")}
                          options={departments.map((dept) => ({
                            label: dept.name,
                            value: dept.id,
                          }))}
                          placeholder={
                            noDepartments
                              ? `暂无部门${canCreateDepartment ? "，请先新建" : ""}`
                              : "选择部门"
                          }
                          searchPlaceholder="搜索部门…"
                          value={field.state.value || null}
                        />
                      </div>
                      {canCreateDepartment ? (
                        <Button
                          onClick={() => setDepartmentDialogOpen(true)}
                          type="button"
                          variant="outline"
                        >
                          <IconPlus className="size-4" />
                          新建
                        </Button>
                      ) : null}
                    </div>
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="voice">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              const isPreviewLoading = loadingPreviewVoice === field.state.value;
              const isPreviewPlaying = playingPreviewVoice === field.state.value;
              let previewIcon = <IconVolume2 className="size-4" />;
              if (isPreviewLoading) {
                previewIcon = <IconLoader2 className="size-4 animate-spin" />;
              } else if (isPreviewPlaying) {
                previewIcon = <IconSquare className="size-4" />;
              }
              return (
                <Field
                  className="md:col-span-2"
                  data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                >
                  <FieldLabel htmlFor={field.name}>
                    音色（TTS）<span className="text-destructive">*</span>
                  </FieldLabel>
                  <FieldContent className="gap-2">
                    <div className="flex gap-2">
                      <Select
                        onValueChange={(value) => {
                          stopVoicePreview();
                          const parsed = minimaxVoiceSchema.safeParse(value);
                          if (parsed.success) {
                            field.handleChange(parsed.data);
                          }
                        }}
                        value={field.state.value}
                      >
                        <SelectTrigger
                          aria-invalid={!!errors?.length}
                          className="flex-1 text-left"
                          id={field.name}
                        >
                          <SelectValue placeholder="选择音色" />
                        </SelectTrigger>
                        <SelectContent>
                          {MINIMAX_INTERVIEWER_VOICES.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                              <div className="flex flex-col">
                                <span>{voice.label}</span>
                                <span className="text-muted-foreground text-xs">
                                  {voice.description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="shrink-0"
                        disabled={loadingPreviewVoice !== null}
                        onClick={async () => {
                          await handlePreviewVoice(field.state.value);
                        }}
                        type="button"
                        variant="outline"
                      >
                        {previewIcon}
                        <span>{isPreviewPlaying ? "停止" : "试听"}</span>
                      </Button>
                    </div>
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>
        </div>

        <form.Field name="description">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>描述（可选）</FieldLabel>
                <FieldContent className="gap-2">
                  <div className="relative">
                    <Textarea
                      aria-invalid={!!errors?.length}
                      className="max-h-40 min-h-20 resize-none pb-6"
                      id={field.name}
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="简要说明该面试官的定位或擅长领域"
                      rows={3}
                      value={field.state.value ?? ""}
                    />
                    <TextareaCounter maxLength={DESCRIPTION_MAX_LENGTH} value={field.state.value} />
                  </div>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="prompt">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>
                  Prompt <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent className="gap-2">
                  <MarkdownEditor
                    aria-invalid={!!errors?.length}
                    id={field.name}
                    maxLength={PROMPT_MAX_LENGTH}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    placeholder="你是一位资深的后端技术面试官……（描述面试官人设、风格、关注点）"
                    value={field.state.value}
                  />
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      </EntityFormDialog>
      {canCreateDepartment ? (
        <DepartmentFormDialog
          onOpenChange={setDepartmentDialogOpen}
          onSaved={handleDepartmentCreated}
          open={departmentDialogOpen}
          record={null}
        />
      ) : null}
    </>
  );
}
