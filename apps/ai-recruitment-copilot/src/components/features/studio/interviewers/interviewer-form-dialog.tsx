"use client";

import { IconLoader2, IconSquare, IconVolume2 } from "@tabler/icons-react";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerFormValues, InterviewerRecord } from "@arc/shared/interviewers";
import { interviewerFormSchema } from "@arc/shared/interviewers";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { toast } from "sonner";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { MarkdownEditor } from "@/components/features/markdown-editor";
import {
  DEFAULT_MINIMAX_VOICE_ID,
  MINIMAX_INTERVIEWER_VOICES,
} from "@arc/db-schema/minimax-voices";
import type { MinimaxVoiceId } from "@arc/db-schema/minimax-voices";
import { EntityFormDialog } from "@/components/features/studio/entity-form-dialog";
import { useEntityForm } from "@/components/features/studio/entity-form";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";

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

export function InterviewerFormDialog({
  open,
  onOpenChange,
  record,
  departments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewerRecord | null;
  departments: DepartmentRecord[];
  onSaved: () => void;
}) {
  const slug = useWorkspaceSlug();
  const isEdit = record !== null;
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

  useEffect(() => {
    if (!open) {
      stopVoicePreview();
    }
    return () => stopVoicePreview();
  }, [open, stopVoicePreview]);

  async function handlePreviewVoice(voice: MinimaxVoiceId) {
    if (playingPreviewVoice === voice) {
      stopVoicePreview();
      return;
    }

    stopVoicePreview();
    setLoadingPreviewVoice(voice);
    try {
      const response = await rpc.api.w[":slug"].studio.interviewers["voice-previews"].$post({
        json: { voice },
        param: { slug },
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
      } | null;
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
    } catch (error) {
      stopVoicePreview();
      toast.error(error instanceof Error ? error.message : "试听音频播放失败");
    } finally {
      setLoadingPreviewVoice(null);
    }
  }

  const { form, isSubmitting } = useEntityForm<InterviewerFormValues>({
    buildValues: () => (record ? toFormValues(record) : defaultValues(fallbackDepartmentId)),
    onSubmit: async (value) => {
      const body = {
        departmentId: value.departmentId,
        description: value.description?.trim() || "",
        name: value.name.trim(),
        prompt: value.prompt.trim(),
        voice: value.voice,
      };

      const response = isEdit
        ? await rpc.api.w[":slug"].studio.interviewers[":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio.interviewers.$post({ json: body, param: { slug } });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "面试官已更新" : "面试官已创建");
      onSaved();
      onOpenChange(false);
    },
    open,
    schema: interviewerFormSchema,
  });

  return (
    <EntityFormDialog
      description="面试官 prompt 与音色会在开始面试时传给语音 agent。"
      formId="interviewer-form"
      isEdit={isEdit}
      isSubmitting={isSubmitting}
      onOpenChange={onOpenChange}
      onSubmit={() => void form.handleSubmit()}
      open={open}
      size="xl"
      submitDisabled={noDepartments}
      title={isEdit ? "编辑面试官" : "新建面试官"}
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
                  <SearchableSelect
                    disabled={noDepartments}
                    id={field.name}
                    invalid={!!errors?.length}
                    onChange={(value) => field.handleChange(value ?? "")}
                    options={departments.map((dept) => ({
                      label: dept.name,
                      value: dept.id,
                    }))}
                    placeholder={noDepartments ? "请先创建部门" : "选择部门"}
                    searchPlaceholder="搜索部门…"
                    value={field.state.value || null}
                  />
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
                        field.handleChange(value as typeof field.state.value);
                      }}
                      value={field.state.value}
                    >
                      <SelectTrigger
                        aria-invalid={!!errors?.length}
                        className="h-13! flex-1 text-left"
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
                      className="h-13 shrink-0"
                      disabled={loadingPreviewVoice !== null}
                      onClick={() => void handlePreviewVoice(field.state.value)}
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
  );
}
