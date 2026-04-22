"use client";

import type { InterviewQuestion, ResumeAnalysisResult, ResumeProfile } from "@/lib/interview/types";
import type { ScheduleEntryStatus, StudioInterviewRecord } from "@/lib/studio-interviews";
import type { AnalysisStreamEvent } from "@/server/agents/resume-analysis-agent";
import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { studioInterviewStatusMeta, studioInterviewStatusValues } from "@/lib/studio-interviews";
import {
  createInterviewFormValues,
  hasFieldErrors,
  normalizeScheduleEntries,
  toFieldErrors,
  toInterviewFormValues,
  useInterviewForm,
} from "./interview-form";
import { InterviewQuestionsFields } from "./interview-questions-fields";
import { InterviewScheduleFields } from "./interview-schedule-fields";
import { JobDescriptionSelectField } from "./job-description-select-field";

export function EditInterviewDialog({
  open,
  onOpenChange,
  recordId,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  onUpdated: (record: StudioInterviewRecord) => void;
}) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<InterviewQuestion[]>([]);
  const [roundStatuses, setRoundStatuses] = useState<Record<string, ScheduleEntryStatus>>({});
  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
      if (!recordId) {
        return;
      }

      const formData = new FormData();
      formData.append("candidateName", values.candidateName);
      formData.append("candidateEmail", values.candidateEmail);
      formData.append("targetRole", values.targetRole);
      formData.append("notes", values.notes);
      formData.append("status", values.status);
      formData.append("jobDescriptionId", values.jobDescriptionId ?? "");
      formData.append(
        "scheduleEntries",
        JSON.stringify(normalizeScheduleEntries(values.scheduleEntries)),
      );

      if (resumeFile) {
        formData.append("resume", resumeFile);
      }

      if (resumePayload) {
        formData.append("resumePayload", JSON.stringify(resumePayload));
      } else if (editedQuestions.length > 0) {
        formData.append("editedQuestions", JSON.stringify(editedQuestions));
      }

      const response = await fetch(`/api/studio/interviews/${recordId}`, {
        body: formData,
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => null)) as
        | StudioInterviewRecord
        | { error?: string }
        | null;

      if (!response.ok || !payload || "error" in payload) {
        toast.error(payload && "error" in payload ? (payload.error ?? "更新失败") : "更新失败");
        return;
      }

      onUpdated(payload as StudioInterviewRecord);
      onOpenChange(false);
      setResumeFile(null);
      setResumePayload(null);
      toast.success("简历记录已更新");
    },
  });
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const closeDialog = useCallback(() => onOpenChangeRef.current(false), []);
  const resetForm = useCallback((record: StudioInterviewRecord) => {
    const values = toInterviewFormValues(record);
    form.setFieldValue("candidateName", values.candidateName);
    form.setFieldValue("candidateEmail", values.candidateEmail);
    form.setFieldValue("targetRole", values.targetRole);
    form.setFieldValue("notes", values.notes);
    form.setFieldValue("status", values.status);
    form.setFieldValue("jobDescriptionId", values.jobDescriptionId ?? "");
    form.setFieldValue("scheduleEntries", values.scheduleEntries);

    setEditedQuestions(record.interviewQuestions ?? []);

    const statuses: Record<string, ScheduleEntryStatus> = {};
    for (const entry of record.scheduleEntries) {
      if (entry.id && entry.status) {
        statuses[entry.id] = entry.status;
      }
    }
    setRoundStatuses(statuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form instance is stable
  }, []);

  const { isLoading: isLoadingRecord } = useQuery({
    enabled: open && !!recordId,
    meta: {
      onError: (error: Error) => {
        toast.error(error.message);
        closeDialog();
      },
    },
    queryFn: async () => {
      setResumeFile(null);
      setResumePayload(null);

      const response = await fetch(`/api/studio/interviews/${recordId}`);
      const payload = (await response.json()) as StudioInterviewRecord | { error?: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? (payload.error ?? "加载编辑数据失败") : "加载编辑数据失败",
        );
      }

      resetForm(payload as StudioInterviewRecord);
      return payload as StudioInterviewRecord;
    },
    queryKey: ["studio-interview-edit", recordId],
  });

  async function handleResumeChange(file: File | null) {
    setResumeFile(file);
    setResumePayload(null);

    if (!file) {
      return;
    }

    setIsAnalyzingResume(true);

    try {
      // Step 1: stream parse resume profile
      const formData = new FormData();
      formData.append("resume", file);

      const parseResponse = await fetch("/api/interview/parse-resume", {
        body: formData,
        method: "POST",
      });

      if (!parseResponse.ok) {
        const errBody = (await parseResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "简历解析失败");
      }

      interface ParseResult {
        fileName: string;
        resumeProfile: ResumeProfile;
      }
      let parseResult: ParseResult | null = null;
      let streamError: string | null = null;

      await readNdjsonStream<AnalysisStreamEvent>(parseResponse, (event) => {
        if (event.type === "result") {
          parseResult = event.data as ParseResult;
        }
        if (event.type === "error") {
          streamError = event.message;
        }
      });

      if (streamError) {
        throw new Error(streamError);
      }

      if (!parseResult) {
        throw new Error("简历解析未返回有效结果");
      }

      const { fileName, resumeProfile } = parseResult as ParseResult;

      form.setFieldValue("candidateName", resumeProfile.name);
      form.setFieldValue("targetRole", resumeProfile.targetRoles[0] ?? "");
      setResumePayload({
        fileName,
        interviewQuestions: [],
        resumeProfile,
      });
      setIsAnalyzingResume(false);
      toast.success("已回填候选人信息，正在生成面试题…");

      // Step 2: stream generate interview questions
      const qResponse = await fetch("/api/interview/generate-questions", {
        body: JSON.stringify({ resumeProfile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!qResponse.ok) {
        const errBody = (await qResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "面试题生成失败");
      }

      let questions: InterviewQuestion[] | null = null;
      streamError = null;

      await readNdjsonStream<AnalysisStreamEvent>(qResponse, (event) => {
        if (event.type === "result") {
          const data = event.data as { interviewQuestions?: InterviewQuestion[] };
          questions = data.interviewQuestions ?? null;
        }
        if (event.type === "error") {
          streamError = event.message;
        }
      });

      if (streamError) {
        throw new Error(streamError);
      }

      if (questions) {
        const nextQuestions = questions;
        setResumePayload((prev) => (prev ? { ...prev, interviewQuestions: nextQuestions } : null));
        toast.success("面试题生成完成");
      }
    } catch (error) {
      setResumePayload((prev) => {
        if (prev?.resumeProfile) {
          return prev;
        }
        return null;
      });
      if (!resumePayload?.resumeProfile) {
        setResumeFile(null);
      }
      toast.error(error instanceof Error ? error.message : "简历分析失败");
    } finally {
      setIsAnalyzingResume(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] sm:max-w-5xl gap-0 overflow-hidden p-0">
        {isLoadingRecord ? (
          <>
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle>编辑简历记录</DialogTitle>
              <DialogDescription>
                更新候选人资料、流程状态、面试安排，并支持替换简历重新分析。
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-[320px] items-center justify-center text-muted-foreground text-sm">
              正在加载编辑数据...
            </div>
          </>
        ) : (
          <form
            className="flex max-h-[calc(90vh-88px)] flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="basic">
              <DialogHeader className="border-b px-6 pt-5 pb-2">
                <DialogTitle>编辑简历记录</DialogTitle>
                <DialogDescription>
                  更新候选人资料、流程状态、面试安排，并支持替换简历重新分析。
                </DialogDescription>
                <TabsList className="mt-0">
                  <TabsTrigger className="min-w-[8em]" value="basic">
                    基础信息
                  </TabsTrigger>
                  <TabsTrigger className="min-w-[8em]" value="questions">
                    面试题目
                    {` (${resumePayload ? resumePayload.interviewQuestions.length : editedQuestions.length})`}
                  </TabsTrigger>
                </TabsList>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <TabsContent className="mt-0" value="basic">
                  <div className="space-y-5">
                    <div className="grid gap-4">
                      <FieldGroup className="gap-2">
                        <FieldLabel htmlFor="edit-resume-upload">替换简历 PDF</FieldLabel>
                        <Input
                          accept="application/pdf"
                          disabled={isAnalyzingResume || isLoadingRecord || isSubmitting}
                          id="edit-resume-upload"
                          onChange={(event) =>
                            void handleResumeChange(event.target.files?.[0] ?? null)
                          }
                          type="file"
                        />
                        <p className="text-muted-foreground text-sm">
                          重新上传后将回填候选人信息与题目，但不会覆盖已维护的轮次安排和备注。
                        </p>
                        {resumeFile ? (
                          <p className="break-all text-muted-foreground text-sm">
                            {resumeFile.name}
                          </p>
                        ) : null}
                        {resumePayload ? (
                          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm">
                            <p className="flex items-center gap-2 font-medium">
                              <SparklesIcon className="size-4 text-amber-500" />
                              已完成新简历分析
                            </p>
                            <p className="mt-1 break-words text-muted-foreground leading-relaxed">
                              {resumePayload.resumeProfile.name}
                              {" · "}
                              {resumePayload.resumeProfile.targetRoles[0] ?? "待识别岗位"}
                              {" · "}
                              {resumePayload.interviewQuestions.length} 道题
                            </p>
                          </div>
                        ) : null}
                      </FieldGroup>
                    </div>

                    <form.Field name="jobDescriptionId">
                      {(field) => {
                        const errors = toFieldErrors(field.state.meta.errors);
                        return (
                          <JobDescriptionSelectField
                            error={errors?.[0]?.message}
                            onChange={(next) => field.handleChange(next)}
                            value={field.state.value ?? ""}
                          />
                        );
                      }}
                    </form.Field>

                    <FieldGroup className="grid gap-5 md:grid-cols-2 md:items-start">
                      <form.Field name="candidateName">
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);

                          return (
                            <Field
                              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                            >
                              <FieldLabel htmlFor={field.name}>候选人姓名</FieldLabel>
                              <FieldContent className="gap-2">
                                <Input
                                  aria-invalid={!!errors?.length}
                                  className="w-full"
                                  id={field.name}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  placeholder="请输入候选人姓名"
                                  value={field.state.value}
                                />
                                <FieldError errors={errors} />
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>

                      <form.Field name="candidateEmail">
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);

                          return (
                            <Field
                              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                            >
                              <FieldLabel htmlFor={field.name}>候选人邮箱</FieldLabel>
                              <FieldContent className="gap-2">
                                <Input
                                  aria-invalid={!!errors?.length}
                                  className="w-full"
                                  id={field.name}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  placeholder="candidate@example.com"
                                  value={field.state.value}
                                />
                                <FieldDescription>可选，用于后台联系与检索。</FieldDescription>
                                <FieldError errors={errors} />
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>

                      <form.Field name="targetRole">
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);

                          return (
                            <Field
                              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                            >
                              <FieldLabel htmlFor={field.name}>目标岗位</FieldLabel>
                              <FieldContent className="gap-2">
                                <Input
                                  aria-invalid={!!errors?.length}
                                  className="w-full"
                                  id={field.name}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  placeholder="如：前端工程师 / 产品经理"
                                  value={field.state.value}
                                />
                                <FieldError errors={errors} />
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>

                      <form.Field name="status">
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);

                          return (
                            <Field
                              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                            >
                              <FieldLabel htmlFor={field.name}>当前流程</FieldLabel>
                              <FieldContent className="gap-2">
                                <Select
                                  onValueChange={(value) =>
                                    field.handleChange(value as typeof field.state.value)
                                  }
                                  value={field.state.value}
                                >
                                  <SelectTrigger
                                    aria-invalid={!!errors?.length}
                                    className="w-full"
                                    id={field.name}
                                  >
                                    <SelectValue placeholder="选择状态" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {studioInterviewStatusValues.map((status) => (
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

                    <InterviewScheduleFields form={form} roundStatuses={roundStatuses} />

                    <form.Field name="notes">
                      {(field) => {
                        const errors = toFieldErrors(field.state.meta.errors);

                        return (
                          <Field
                            data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                          >
                            <FieldLabel htmlFor={field.name}>内部备注</FieldLabel>
                            <FieldContent className="gap-2">
                              <Textarea
                                aria-invalid={!!errors?.length}
                                className="min-h-32 w-full"
                                id={field.name}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(event.target.value)}
                                placeholder="记录候选人背景、跟进建议或招聘备注"
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

                <TabsContent className="mt-0" value="questions">
                  <InterviewQuestionsFields
                    disabled={isSubmitting || isAnalyzingResume || isLoadingRecord}
                    onChange={(questions) => {
                      if (resumePayload) {
                        setResumePayload({ ...resumePayload, interviewQuestions: questions });
                      } else {
                        setEditedQuestions(questions);
                      }
                    }}
                    questions={resumePayload ? resumePayload.interviewQuestions : editedQuestions}
                  />
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="border-t px-6 py-4">
              <Button disabled={isSubmitting || isAnalyzingResume || isLoadingRecord} type="submit">
                {isSubmitting || isAnalyzingResume || isLoadingRecord ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : null}
                保存更新
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
