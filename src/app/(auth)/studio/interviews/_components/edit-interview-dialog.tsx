"use client";

import type { ScheduleEntryStatus, StudioInterviewRecord } from "@/lib/studio-interviews";
import { useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
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
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, fetchStudioInterview, resetStudioInterviewRound } from "@/lib/api";
import {
  createInterviewFormValues,
  toInterviewFormValues,
  useInterviewForm,
} from "./interview-form";
import { InterviewBasicInfoFields, InterviewNotesField } from "./interview-form/basic-info-fields";
import { buildInterviewFormData } from "./interview-form/build-form-data";
import { AgentInstructionsPanel } from "./agent-instructions-panel";
import { InterviewQuestionBindingsSection } from "./interview-question-bindings-section";
import { InterviewQuestionsFields } from "./interview-questions-fields";
import { InterviewScheduleFields } from "./interview-schedule-fields";

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
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [roundStatuses, setRoundStatuses] = useState<Record<string, ScheduleEntryStatus>>({});
  const [resettingRoundId, setResettingRoundId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
      if (!recordId) {
        return;
      }

      const formData = buildInterviewFormData(values, {
        questionsFieldName: "editedQuestions",
        resumeFile,
      });

      try {
        const updated = await apiFetch<StudioInterviewRecord>(
          `/api/studio/interviews/${recordId}`,
          { body: formData, method: "PATCH" },
        );
        onUpdated(updated);
        onOpenChange(false);
        setResumeFile(null);
        toast.success("面试记录已更新");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "更新失败");
      }
    },
    onSubmitInvalid: (fieldMeta) => {
      const hasQuestionError = Object.entries(fieldMeta).some(
        ([key, value]) =>
          key.startsWith("interviewQuestions") &&
          ((value as { errors?: unknown[] })?.errors?.length ?? 0) > 0,
      );
      if (hasQuestionError) {
        setActiveTab("questions");
      }
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
    form.setFieldValue("interviewQuestions", values.interviewQuestions);

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
      const record = await fetchStudioInterview(recordId as string);
      if (!record) {
        throw new Error("加载编辑数据失败");
      }
      resetForm(record);
      return record;
    },
    queryKey: ["studio-interview-edit", recordId],
  });

  function handleResumeChange(file: File | null) {
    setResumeFile(file);
  }

  async function handleResetRound(roundId: string) {
    if (!recordId || resettingRoundId) {
      return;
    }

    setResettingRoundId(roundId);

    try {
      const updated = await resetStudioInterviewRound(recordId, roundId);
      toast.success("轮次已重置为待开始");
      // 仅在本地清掉该轮次的锁定状态，不重写表单值，
      // 避免覆盖用户在题目 / Agent 提示词等其他 tab 中尚未保存的修改。
      // Drop the local lock for this round only — don't overwrite the form,
      // so unsaved edits in other tabs (questions, agent instructions) survive.
      setRoundStatuses((prev) => {
        if (!(roundId in prev)) {
          return prev;
        }
        const { [roundId]: _removed, ...rest } = prev;
        return rest;
      });
      await queryClient.invalidateQueries({ queryKey: ["studio-interview", recordId] });
      await queryClient.invalidateQueries({ queryKey: ["studio-interview-reports", recordId] });
      onUpdated(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setResettingRoundId(null);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] sm:max-w-5xl gap-0 overflow-hidden p-0">
        {isLoadingRecord ? (
          <>
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle>编辑面试记录</DialogTitle>
              <DialogDescription>
                更新候选人资料、流程状态、面试安排，并支持替换关联的简历 PDF。
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
            <Tabs
              className="flex min-h-0 flex-1 flex-col"
              onValueChange={setActiveTab}
              value={activeTab}
            >
              <DialogHeader className="border-b px-6 pt-5 pb-2">
                <DialogTitle>编辑面试记录</DialogTitle>
                <DialogDescription>
                  更新候选人资料、流程状态、面试安排，并支持替换关联的简历 PDF。
                </DialogDescription>
                <TabsList className="mt-0">
                  <TabsTrigger className="min-w-[8em]" value="basic">
                    基础信息
                  </TabsTrigger>
                  <TabsTrigger className="min-w-[8em]" value="questions">
                    面试题目
                  </TabsTrigger>
                  <TabsTrigger className="min-w-[8em]" value="instructions">
                    Agent 提示词
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
                          disabled={isLoadingRecord || isSubmitting}
                          id="edit-resume-upload"
                          onChange={(event) => handleResumeChange(event.target.files?.[0] ?? null)}
                          type="file"
                        />
                        <p className="text-muted-foreground text-sm">
                          仅替换关联的简历
                          PDF，不会重新解析简历或覆盖已维护的候选人信息、面试题与轮次安排。
                        </p>
                        {resumeFile ? (
                          <p className="break-all text-muted-foreground text-sm">
                            {resumeFile.name}
                          </p>
                        ) : null}
                      </FieldGroup>
                    </div>

                    <InterviewBasicInfoFields form={form} />

                    <InterviewScheduleFields
                      form={form}
                      onResetRound={handleResetRound}
                      resettingRoundId={resettingRoundId}
                      roundStatuses={roundStatuses}
                    />

                    <InterviewNotesField form={form} />
                  </div>
                </TabsContent>

                <TabsContent className="mt-0 space-y-6" value="questions">
                  {recordId ? (
                    <InterviewQuestionBindingsSection
                      disabled={isSubmitting || isLoadingRecord}
                      interviewId={recordId}
                    />
                  ) : null}

                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-sm">候选人专属面试题</p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        基于该候选人的简历单独维护的题目，仅用于本次面试。
                      </p>
                    </div>
                    <InterviewQuestionsFields
                      disabled={isSubmitting || isLoadingRecord}
                      form={form}
                      resetKey={recordId ?? "new"}
                    />
                  </div>
                </TabsContent>

                <TabsContent className="mt-0" value="instructions">
                  <AgentInstructionsPanel
                    enabled={open && activeTab === "instructions"}
                    recordId={recordId}
                  />
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="border-t px-6 py-4">
              <Button disabled={isSubmitting || isLoadingRecord} type="submit">
                {isSubmitting || isLoadingRecord ? (
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
