'use client';

import type { ResumeAnalysisResult } from '@/lib/interview/types';
import type { StudioInterviewRecord } from '@/lib/studio-interviews';
import { useStore } from '@tanstack/react-form';
import { LoaderCircleIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  studioInterviewStatusMeta,
  studioInterviewStatusValues,
} from '@/lib/studio-interviews';
import {
  createInterviewFormValues,
  hasFieldErrors,
  normalizeScheduleEntries,
  toFieldErrors,
  toInterviewFormValues,
  useInterviewForm,
} from './interview-form';
import { InterviewScheduleFields } from './interview-schedule-fields';

export function EditInterviewDialog({
  open,
  onOpenChange,
  recordId,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string | null
  onUpdated: (record: StudioInterviewRecord) => void
}) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
      if (!recordId) {
        return;
      }

      const formData = new FormData();
      formData.append('candidateName', values.candidateName);
      formData.append('candidateEmail', values.candidateEmail);
      formData.append('targetRole', values.targetRole);
      formData.append('notes', values.notes);
      formData.append('status', values.status);
      formData.append('scheduleEntries', JSON.stringify(normalizeScheduleEntries(values.scheduleEntries)));

      if (resumeFile) {
        formData.append('resume', resumeFile);
      }

      if (resumePayload) {
        formData.append('resumePayload', JSON.stringify(resumePayload));
      }

      const response = await fetch(`/api/studio/interviews/${recordId}`, {
        method: 'PATCH',
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as StudioInterviewRecord | { error?: string } | null;

      if (!response.ok || !payload || 'error' in payload) {
        toast.error(payload && 'error' in payload ? payload.error ?? '更新失败' : '更新失败');
        return;
      }

      onUpdated(payload as StudioInterviewRecord);
      onOpenChange(false);
      setResumeFile(null);
      setResumePayload(null);
      toast.success('简历记录已更新');
    },
  });
  const isSubmitting = useStore(form.store, state => state.isSubmitting);
  const closeDialog = useEffectEvent(() => onOpenChange(false));

  useEffect(() => {
    if (!open || !recordId) {
      return;
    }

    const controller = new AbortController();

    async function loadRecord() {
      setIsLoadingRecord(true);
      setResumeFile(null);
      setResumePayload(null);

      try {
        const response = await fetch(`/api/studio/interviews/${recordId}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as StudioInterviewRecord | { error?: string } | null;

        if (!response.ok || !payload || 'error' in payload) {
          throw new Error(payload && 'error' in payload ? payload.error ?? '加载编辑数据失败' : '加载编辑数据失败');
        }

        form.reset(toInterviewFormValues(payload as StudioInterviewRecord));
      }
      catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        toast.error(error instanceof Error ? error.message : '加载编辑数据失败');
        closeDialog();
      }
      finally {
        if (!controller.signal.aborted) {
          setIsLoadingRecord(false);
        }
      }
    }

    void loadRecord();

    return () => controller.abort();
  }, [form, open, recordId]);

  async function handleResumeChange(file: File | null) {
    setResumeFile(file);
    setResumePayload(null);

    if (!file) {
      return;
    }

    setIsAnalyzingResume(true);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/interview/parse-resume', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as (ResumeAnalysisResult & { error?: string }) | null;

      if (!response.ok || !payload?.resumeProfile || !payload?.interviewQuestions || !payload.fileName) {
        throw new Error(payload?.error ?? '简历分析失败');
      }

      setResumePayload(payload);
      form.setFieldValue('candidateName', payload.resumeProfile.name);
      form.setFieldValue('targetRole', payload.resumeProfile.targetRoles[0] ?? '');
      toast.success('已根据新简历回填候选人信息，面试安排和备注保持不变');
    }
    catch (error) {
      setResumeFile(null);
      setResumePayload(null);
      toast.error(error instanceof Error ? error.message : '简历分析失败');
    }
    finally {
      setIsAnalyzingResume(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-h-[90vh] max-w-5xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>编辑简历记录</DialogTitle>
          <DialogDescription>更新候选人资料、流程状态、面试安排，并支持替换简历重新分析。</DialogDescription>
        </DialogHeader>

        {isLoadingRecord
          ? (
              <div className='flex min-h-[320px] items-center justify-center text-muted-foreground text-sm'>
                正在加载编辑数据...
              </div>
            )
          : (
              <form
                className='space-y-5'
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void form.handleSubmit();
                }}
              >
                <div className='grid gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/25 p-5'>
                  <FieldGroup className='gap-2'>
                    <FieldLabel htmlFor='edit-resume-upload'>替换简历 PDF</FieldLabel>
                    <Input
                      accept='application/pdf'
                      disabled={isAnalyzingResume || isLoadingRecord || isSubmitting}
                      id='edit-resume-upload'
                      onChange={event => void handleResumeChange(event.target.files?.[0] ?? null)}
                      type='file'
                    />
                    <p className='text-muted-foreground text-sm'>重新上传后将回填候选人信息与题目，但不会覆盖已维护的轮次安排和备注。</p>
                    {resumeFile ? <p className='break-all text-muted-foreground text-sm'>{resumeFile.name}</p> : null}
                    {resumePayload
                      ? (
                          <div className='rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm'>
                            <p className='flex items-center gap-2 font-medium'>
                              <SparklesIcon className='size-4 text-amber-500' />
                              已完成新简历分析
                            </p>
                            <p className='mt-1 break-words text-muted-foreground leading-relaxed'>
                              {resumePayload.resumeProfile.name}
                              {' · '}
                              {resumePayload.resumeProfile.targetRoles[0] ?? '待识别岗位'}
                              {' · '}
                              {resumePayload.interviewQuestions.length}
                              {' '}
                              道题
                            </p>
                          </div>
                        )
                      : null}
                  </FieldGroup>
                </div>

                <FieldGroup className='grid gap-5 md:grid-cols-2 md:items-start'>
                  <form.Field name='candidateName'>
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);

                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>候选人姓名</FieldLabel>
                          <FieldContent className='gap-2'>
                            <Input
                              aria-invalid={!!errors?.length}
                              className='w-full'
                              id={field.name}
                              onBlur={field.handleBlur}
                              onChange={event => field.handleChange(event.target.value)}
                              placeholder='请输入候选人姓名'
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name='candidateEmail'>
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);

                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>候选人邮箱</FieldLabel>
                          <FieldContent className='gap-2'>
                            <Input
                              aria-invalid={!!errors?.length}
                              className='w-full'
                              id={field.name}
                              onBlur={field.handleBlur}
                              onChange={event => field.handleChange(event.target.value)}
                              placeholder='candidate@example.com'
                              value={field.state.value}
                            />
                            <FieldDescription>可选，用于后台联系与检索。</FieldDescription>
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name='targetRole'>
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);

                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>目标岗位</FieldLabel>
                          <FieldContent className='gap-2'>
                            <Input
                              aria-invalid={!!errors?.length}
                              className='w-full'
                              id={field.name}
                              onBlur={field.handleBlur}
                              onChange={event => field.handleChange(event.target.value)}
                              placeholder='如：前端工程师 / 产品经理'
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name='status'>
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);

                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>当前流程</FieldLabel>
                          <FieldContent className='gap-2'>
                            <Select onValueChange={value => field.handleChange(value as typeof field.state.value)} value={field.state.value}>
                              <SelectTrigger aria-invalid={!!errors?.length} className='w-full' id={field.name}>
                                <SelectValue placeholder='选择状态' />
                              </SelectTrigger>
                              <SelectContent>
                                {studioInterviewStatusValues.map(status => (
                                  <SelectItem key={status} value={status}>
                                    {studioInterviewStatusMeta[status].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>
                </FieldGroup>

                <InterviewScheduleFields form={form} />

                <form.Field name='notes'>
                  {(field) => {
                    const errors = toFieldErrors(field.state.meta.errors);

                    return (
                      <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                        <FieldLabel htmlFor={field.name}>内部备注</FieldLabel>
                        <FieldContent className='gap-2'>
                          <Textarea
                            aria-invalid={!!errors?.length}
                            className='min-h-32 w-full'
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={event => field.handleChange(event.target.value)}
                            placeholder='记录候选人背景、跟进建议或招聘备注'
                            value={field.state.value}
                          />
                          <FieldError errors={errors} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                </form.Field>

                <DialogFooter>
                  <Button disabled={isSubmitting || isAnalyzingResume || isLoadingRecord} type='submit'>
                    {isSubmitting || isAnalyzingResume || isLoadingRecord ? <LoaderCircleIcon className='size-4 animate-spin' /> : null}
                    保存更新
                  </Button>
                </DialogFooter>
              </form>
            )}
      </DialogContent>
    </Dialog>
  );
}
