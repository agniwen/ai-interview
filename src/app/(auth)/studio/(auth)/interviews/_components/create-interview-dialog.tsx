'use client';

import type { ResumeAnalysisResult } from '@/lib/interview/types';
import type { StudioInterviewRecord } from '@/lib/studio-interviews';
import { useStore } from '@tanstack/react-form';
import { useAtomValue } from 'jotai';
import { FileUpIcon, LoaderCircleIcon, SparklesIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  STUDIO_TUTORIAL_MOCK_FORM,
  STUDIO_TUTORIAL_MOCK_QUESTIONS,
} from '@/app/(auth)/studio/_hooks/studio-tutorial-mock';
import {
  STUDIO_DIALOG_FIRST_STEP,
  STUDIO_DIALOG_LAST_STEP,
  STUDIO_QUESTIONS_TAB_STEP,
  studioTutorialStepAtom,
} from '@/app/(auth)/studio/_hooks/use-studio-tutorial';
import { TextFlip } from '@/components/text-flip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  useInterviewForm,
} from './interview-form';
import { InterviewQuestionsFields } from './interview-questions-fields';
import { InterviewScheduleFields } from './interview-schedule-fields';

export function CreateInterviewDialog({
  onCreated,
}: {
  onCreated: (record: StudioInterviewRecord) => void
}) {
  const tutorialStep = useAtomValue(studioTutorialStepAtom);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('basic');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const tutorialMockedRef = useRef(false);
  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
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

      const response = await fetch('/api/studio/interviews', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as StudioInterviewRecord | { error?: string } | null;

      if (!response.ok || !payload || 'error' in payload) {
        toast.error(payload && 'error' in payload ? payload.error ?? '创建失败' : '创建失败');
        return;
      }

      onCreated(payload as StudioInterviewRecord);
      setOpen(false);
      setResumeFile(null);
      setResumePayload(null);
      form.reset(createInterviewFormValues());
      toast.success('简历库记录已创建');
    },
  });
  const isSubmitting = useStore(form.store, state => state.isSubmitting);

  // Tutorial: control dialog open state, tab, and mock form values
  const isTutorialDialog = tutorialStep !== null
    && tutorialStep >= STUDIO_DIALOG_FIRST_STEP
    && tutorialStep <= STUDIO_DIALOG_LAST_STEP;

  useEffect(() => {
    if (isTutorialDialog) {
      setOpen(true);

      // Mock form values once when dialog opens for tutorial
      if (!tutorialMockedRef.current) {
        tutorialMockedRef.current = true;
        form.setFieldValue('candidateName', STUDIO_TUTORIAL_MOCK_FORM.candidateName);
        form.setFieldValue('candidateEmail', STUDIO_TUTORIAL_MOCK_FORM.candidateEmail);
        form.setFieldValue('targetRole', STUDIO_TUTORIAL_MOCK_FORM.targetRole);
        form.setFieldValue('status', STUDIO_TUTORIAL_MOCK_FORM.status);
        form.setFieldValue('notes', STUDIO_TUTORIAL_MOCK_FORM.notes);
      }

      // Switch tab based on step
      if (tutorialStep >= STUDIO_QUESTIONS_TAB_STEP) {
        setActiveTab('questions');
      }
      else {
        setActiveTab('basic');
      }
    }
    else if (tutorialStep === null && tutorialMockedRef.current) {
      // Tutorial ended — close dialog and reset mock
      tutorialMockedRef.current = false;
      setOpen(false);
      setActiveTab('basic');
      form.reset(createInterviewFormValues());
    }
  }, [tutorialStep, isTutorialDialog, form]);

  // Tutorial: mock questions for the questions tab
  const displayQuestions = isTutorialDialog
    ? STUDIO_TUTORIAL_MOCK_QUESTIONS
    : (resumePayload?.interviewQuestions ?? []);

  async function handleResumeChange(file: File | null) {
    setResumeFile(file);
    setResumePayload(null);

    if (!file) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsAnalyzingResume(true);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/interview/parse-resume', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });
      const payload = (await response.json().catch(() => null)) as (ResumeAnalysisResult & { error?: string }) | null;

      if (!response.ok || !payload?.resumeProfile || !payload?.interviewQuestions || !payload.fileName) {
        throw new Error(payload?.error ?? '简历分析失败');
      }

      setResumePayload(payload);
      form.setFieldValue('candidateName', payload.resumeProfile.name);
      form.setFieldValue('targetRole', payload.resumeProfile.targetRoles[0] ?? '');
      toast.success('简历分析完成，已回填候选人信息');
    }
    catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      setResumeFile(null);
      setResumePayload(null);
      toast.error(error instanceof Error ? error.message : '简历分析失败');
    }
    finally {
      abortControllerRef.current = null;
      setIsAnalyzingResume(false);
    }
  }

  const handleCancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    const fileInput = document.getElementById('resume-upload') as HTMLInputElement | null;
    if (fileInput)
      fileInput.value = '';
    toast.info('已取消简历分析');
  }, []);

  return (
    <Dialog
      onOpenChange={(value) => {
        if (isTutorialDialog)
          return;
        if (!isAnalyzingResume)
          setOpen(value);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button>
          <FileUpIcon className='size-4' />
          新建简历记录
        </Button>
      </DialogTrigger>
      <DialogContent
        className='max-h-[90vh] sm:max-w-5xl gap-0 overflow-hidden p-0'
        onPointerDownOutside={(e) => {
          if (isAnalyzingResume || isTutorialDialog)
            e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isAnalyzingResume || isTutorialDialog)
            e.preventDefault();
        }}
        showCloseButton={!isAnalyzingResume && !isTutorialDialog}
      >
        <form
          className='flex max-h-[90vh] flex-col'
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isTutorialDialog) {
              void form.handleSubmit();
            }
          }}
        >
          <Tabs className='flex min-h-0 flex-1 flex-col' value={activeTab} onValueChange={isTutorialDialog ? undefined : setActiveTab}>
            <DialogHeader className='border-b px-6 pt-5 pb-2'>
              <DialogTitle>新建简历记录</DialogTitle>
              <DialogDescription>支持手动录入候选人资料，也可以先上传 PDF 简历自动分析并回填表单。</DialogDescription>
              <TabsList className='mt-0'>
                <TabsTrigger className='min-w-[6em]' value='basic'>基础信息</TabsTrigger>
                <TabsTrigger className='min-w-[6em]' value='questions'>
                  面试题目
                  {isTutorialDialog
                    ? ` (${STUDIO_TUTORIAL_MOCK_QUESTIONS.length})`
                    : resumePayload ? ` (${resumePayload.interviewQuestions.length})` : ''}
                </TabsTrigger>
              </TabsList>
            </DialogHeader>

            <div className='min-h-0 flex-1 overflow-y-auto px-6 py-6'>
              <TabsContent className='mt-0' value='basic'>
                <div className='space-y-5'>
                  <div className='grid gap-4'>
                    <FieldGroup className='gap-2'>
                      <FieldLabel htmlFor='resume-upload'>简历 PDF</FieldLabel>
                      <Input
                        accept='application/pdf'
                        disabled={isAnalyzingResume || isSubmitting}
                        id='resume-upload'
                        onChange={event => void handleResumeChange(event.target.files?.[0] ?? null)}
                        type='file'
                      />
                      <p className='text-muted-foreground text-sm'>选填。上传后会调用现有简历分析接口，自动回填候选人姓名、岗位和题目数据。</p>
                      {resumeFile ? <p className='break-all text-muted-foreground text-sm'>{resumeFile.name}</p> : null}
                      {resumePayload
                        ? (
                            <div className='rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm'>
                              <p className='flex items-center gap-2 font-medium'>
                                <SparklesIcon className='size-4 text-amber-500' />
                                已完成简历分析
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

                  <FieldGroup className='grid gap-5 md:grid-cols-2 md:items-start' data-tour='studio-dialog-basic'>
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
                              <FieldDescription>可选，方便后台检索与跟进。</FieldDescription>
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

                  <div data-tour='studio-dialog-schedule'>
                    <InterviewScheduleFields form={form} />
                  </div>

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
                              placeholder='记录候选人来源、业务线、面试关注点等信息'
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>
                </div>
              </TabsContent>

              <TabsContent className='mt-0' value='questions' data-tour='studio-dialog-questions'>
                <InterviewQuestionsFields
                  disabled={isSubmitting || isAnalyzingResume}
                  onChange={questions => setResumePayload(prev => prev ? { ...prev, interviewQuestions: questions } : null)}
                  questions={displayQuestions}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className='border-t px-6 py-4' data-tour='studio-dialog-submit'>
            <Button disabled={isSubmitting || isAnalyzingResume} type='submit'>
              {isSubmitting || isAnalyzingResume ? <LoaderCircleIcon className='size-4 animate-spin' /> : null}
              保存简历记录
            </Button>
          </DialogFooter>
        </form>

        {isAnalyzingResume && (
          <motion.div
            className='absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 rounded-lg bg-white/60 backdrop-blur-sm dark:bg-black/40'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <LoaderCircleIcon className='size-7 animate-spin text-muted-foreground' />
            <motion.div layout className='flex items-center  text-lg font-medium text-foreground'>
              <span>正在</span>
              <TextFlip as={motion.span} interval={2.5} layout>
                <span>解析简历</span>
                <span>提取信息</span>
                <span>生成面试题</span>
                <span>分析简历</span>
                <span>生成面试链接</span>
                <span>评估技能</span>
              </TextFlip>
            </motion.div>
            <Button variant='outline' size='sm' onClick={handleCancelAnalysis}>
              取消
            </Button>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
