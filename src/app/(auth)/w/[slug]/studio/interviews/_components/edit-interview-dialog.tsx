"use client";

import type { ScheduleEntryStatus, StudioInterviewRecord } from "@/lib/shared/studio-interviews";
import { useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, PencilIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatedHeight } from "@/components/animated-height";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, fetchStudioInterview, resetStudioInterviewRound } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { CandidateBasicInfoView } from "@/components/candidate-basic-info-view";
import {
  createInterviewFormValues,
  toInterviewFormValues,
  useInterviewForm,
} from "./interview-form";
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
  const slug = useWorkspaceSlug();
  const router = useRouter();
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
        resumeFile: null,
      });

      try {
        const updated = await apiFetch<StudioInterviewRecord>(
          `/api/w/${slug}/studio/interviews/${recordId}`,
          { body: formData, method: "PATCH" },
        );
        onUpdated(updated);
        onOpenChange(false);
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

  const { data: recordEditing, isLoading: isLoadingRecord } = useQuery({
    enabled: open && !!recordId,
    meta: {
      onError: (error: Error) => {
        toast.error(error.message);
        closeDialog();
      },
    },
    queryFn: async () => {
      const record = await fetchStudioInterview(slug, recordId as string);
      if (!record) {
        throw new Error("加载编辑数据失败");
      }
      resetForm(record);
      return record;
    },
    queryKey: ["studio-interview-edit", slug, recordId],
  });

  async function handleResetRound(roundId: string) {
    if (!recordId || resettingRoundId) {
      return;
    }

    setResettingRoundId(roundId);

    try {
      const updated = await resetStudioInterviewRound(slug, recordId, roundId);
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
    <Tabs onValueChange={setActiveTab} value={activeTab}>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="编辑面试记录"
        description="维护面试流程：状态、安排、面试题、Agent 提示词。候选人资料请在简历库编辑。"
        size="2xl"
        headerExtra={
          isLoadingRecord ? null : (
            <TabsList className="mt-2">
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
          )
        }
        footer={
          isLoadingRecord ? undefined : (
            <Button
              disabled={isSubmitting || isLoadingRecord}
              form="edit-interview-form"
              type="submit"
            >
              {isSubmitting || isLoadingRecord ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存更新
            </Button>
          )
        }
      >
        {isLoadingRecord ? (
          <div className="flex min-h-[320px] items-center justify-center text-muted-foreground text-sm">
            正在加载编辑数据...
          </div>
        ) : (
          <form
            id="edit-interview-form"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <AnimatedHeight>
              <TabsContent className="mt-0" value="basic">
                <div className="space-y-5">
                  {recordEditing ? (
                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                      <CandidateBasicInfoView
                        candidateName={recordEditing.candidateName}
                        candidateEmail={recordEditing.candidateEmail}
                        candidatePhone={recordEditing.candidatePhone}
                        targetRole={recordEditing.targetRole}
                        jobDescriptionName={recordEditing.jobDescriptionName}
                        creatorName={null}
                        resumeFileName={recordEditing.resumeFileName}
                        hasResumeFile={Boolean(recordEditing.resumeStorageKey)}
                        footer={
                          <Button
                            onClick={() => {
                              router.push(`/w/${slug}/studio/resumes?recordId=${recordEditing.id}`);
                              onOpenChange(false);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <PencilIcon className="size-3.5" />
                            编辑候选人信息
                          </Button>
                        }
                      />
                      <p className="mt-3 text-muted-foreground text-xs">
                        候选人姓名 / 邮箱 / 电话 / 目标岗位 / 关联岗位 / 简历 PDF
                        在简历库统一维护，请在那里编辑。
                      </p>
                    </div>
                  ) : null}

                  <InterviewScheduleFields
                    form={form}
                    onResetRound={handleResetRound}
                    resettingRoundId={resettingRoundId}
                    roundStatuses={roundStatuses}
                  />
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
            </AnimatedHeight>
          </form>
        )}
      </Modal>
    </Tabs>
  );
}
