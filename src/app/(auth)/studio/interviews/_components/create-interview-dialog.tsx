"use client";

import type { InterviewQuestion, ResumeAnalysisResult, ResumeProfile } from "@/lib/interview/types";
import type { StudioInterviewRecord } from "@/lib/studio-interviews";
import type { AnalysisStreamEvent } from "@/server/agents/resume-analysis-agent";
import { useStore } from "@tanstack/react-form";
import { useAtomValue } from "jotai";
import { CheckIcon, FileUpIcon, LoaderCircleIcon, SparklesIcon, WrenchIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  STUDIO_TUTORIAL_MOCK_FORM,
  STUDIO_TUTORIAL_MOCK_QUESTIONS,
} from "@/app/(auth)/studio/_hooks/studio-tutorial-mock";
import {
  refreshStudioTutorialHighlight,
  STUDIO_DIALOG_FIRST_STEP,
  STUDIO_DIALOG_LAST_STEP,
  STUDIO_QUESTIONS_TAB_STEP,
  studioTutorialStepAtom,
} from "@/app/(auth)/studio/_hooks/use-studio-tutorial";
import { TextFlip } from "@/components/text-flip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  useInterviewForm,
} from "./interview-form";
import { InterviewQuestionsFields } from "./interview-questions-fields";
import { InterviewScheduleFields } from "./interview-schedule-fields";
import { JobDescriptionSelectField } from "./job-description-select-field";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

function resolveQuestionsTabSuffix({
  displayQuestions,
  isTutorialDialog,
}: {
  displayQuestions: InterviewQuestion[];
  isTutorialDialog: boolean;
}) {
  if (isTutorialDialog) {
    return ` (${STUDIO_TUTORIAL_MOCK_QUESTIONS.length})`;
  }
  if (displayQuestions.length > 0) {
    return ` (${displayQuestions.length})`;
  }
  return "";
}

// oxlint-disable-next-line complexity -- Create dialog owns form, upload, schedule, and interview-questions flows together; extracting pieces fragments state.
export function CreateInterviewDialog({
  onCreated,
}: {
  onCreated: (record: StudioInterviewRecord) => void;
}) {
  const tutorialStep = useAtomValue(studioTutorialStepAtom);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [manualQuestions, setManualQuestions] = useState<InterviewQuestion[]>([]);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const accumulatedTextRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const tutorialMockedRef = useRef(false);
  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
      const formData = new FormData();
      formData.append("candidateName", values.candidateName);
      formData.append("candidateEmail", values.candidateEmail);
      formData.append("targetRole", values.targetRole);
      formData.append("notes", values.notes);
      formData.append("status", values.status);
      if (values.jobDescriptionId) {
        formData.append("jobDescriptionId", values.jobDescriptionId);
      }
      formData.append(
        "scheduleEntries",
        JSON.stringify(normalizeScheduleEntries(values.scheduleEntries)),
      );

      if (resumeFile) {
        formData.append("resume", resumeFile);
      }

      if (resumePayload) {
        formData.append("resumePayload", JSON.stringify(resumePayload));
      } else if (manualQuestions.length > 0) {
        formData.append("manualInterviewQuestions", JSON.stringify(manualQuestions));
      }

      const response = await fetch("/api/studio/interviews", {
        body: formData,
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | StudioInterviewRecord
        | { error?: string }
        | null;

      if (!response.ok || !payload || "error" in payload) {
        toast.error(payload && "error" in payload ? (payload.error ?? "创建失败") : "创建失败");
        return;
      }

      onCreated(payload as StudioInterviewRecord);
      setOpen(false);
      setResumeFile(null);
      setResumePayload(null);
      setManualQuestions([]);
      form.reset(createInterviewFormValues());
      toast.success("简历库记录已创建");
    },
  });
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  // Tutorial: control dialog open state, tab, and mock form values
  const isTutorialDialog =
    tutorialStep !== null &&
    tutorialStep >= STUDIO_DIALOG_FIRST_STEP &&
    tutorialStep <= STUDIO_DIALOG_LAST_STEP;

  useEffect(() => {
    if (isTutorialDialog) {
      const wasOpen = open;
      setOpen(true);

      // Mock form values once when dialog opens for tutorial
      if (!tutorialMockedRef.current) {
        tutorialMockedRef.current = true;
        form.setFieldValue("candidateName", STUDIO_TUTORIAL_MOCK_FORM.candidateName);
        form.setFieldValue("candidateEmail", STUDIO_TUTORIAL_MOCK_FORM.candidateEmail);
        form.setFieldValue("targetRole", STUDIO_TUTORIAL_MOCK_FORM.targetRole);
        form.setFieldValue("status", STUDIO_TUTORIAL_MOCK_FORM.status);
        form.setFieldValue("notes", STUDIO_TUTORIAL_MOCK_FORM.notes);
      }

      // Switch tab based on step
      if (tutorialStep >= STUDIO_QUESTIONS_TAB_STEP) {
        setActiveTab("questions");
      } else {
        setActiveTab("basic");
      }

      // Dialog entrance animation ends before driver.js re-samples the
      // highlighted element; refresh once after it settles so step 6's
      // popover lines up with the basic-info FieldGroup.
      if (!wasOpen) {
        const id = window.setTimeout(() => {
          refreshStudioTutorialHighlight();
        }, 320);

        return () => window.clearTimeout(id);
      }
    } else if (tutorialStep === null && tutorialMockedRef.current) {
      // Tutorial ended — close dialog and reset mock
      tutorialMockedRef.current = false;
      setOpen(false);
      setActiveTab("basic");
      form.reset(createInterviewFormValues());
    }
  }, [tutorialStep, isTutorialDialog, form, open]);

  // Tutorial: mock questions for the questions tab
  let displayQuestions: InterviewQuestion[];
  if (isTutorialDialog) {
    displayQuestions = STUDIO_TUTORIAL_MOCK_QUESTIONS;
  } else if (resumePayload) {
    displayQuestions = resumePayload.interviewQuestions;
  } else {
    displayQuestions = manualQuestions;
  }

  function tryExtractPartialFields(text: string) {
    const fields: { label: string; value: string }[] = [];
    const FIELD_MAP: { key: string; label: string }[] = [
      { key: '"name"', label: "姓名" },
      { key: '"gender"', label: "性别" },
      { key: '"age"', label: "年龄" },
      { key: '"workYears"', label: "工作年限" },
      { key: '"targetRoles"', label: "目标岗位" },
      { key: '"skills"', label: "技能" },
      { key: '"schools"', label: "院校" },
    ];

    for (const { key, label } of FIELD_MAP) {
      const idx = text.indexOf(key);
      if (idx === -1) {
        continue;
      }

      const afterColon = text.indexOf(":", idx + key.length);
      if (afterColon === -1) {
        continue;
      }

      const rest = text.slice(afterColon + 1).trimStart();
      if (!rest) {
        continue;
      }

      // Extract string value: "value"
      if (rest.startsWith('"')) {
        const endQuote = rest.indexOf('"', 1);
        if (endQuote > 1) {
          const val = rest.slice(1, endQuote);
          if (val && val !== "未发现信息") {
            fields.push({ label, value: val });
          }
        }
      }
      // Extract number: 5
      else if (LEADING_DIGIT_RE.test(rest)) {
        const match = rest.match(LEADING_DIGITS_RE);
        if (match) {
          fields.push({ label, value: match[1] });
        }
      }
      // Extract array: ["a", "b"]
      else if (rest.startsWith("[")) {
        const endBracket = rest.indexOf("]");
        if (endBracket > 1) {
          try {
            const arr = JSON.parse(rest.slice(0, endBracket + 1)) as string[];
            if (arr.length > 0) {
              fields.push({ label, value: arr.slice(0, 5).join("、") });
            }
          } catch {
            /* partial array, skip */
          }
        }
      }
    }

    return fields;
  }

  function handleStreamEvent(event: AnalysisStreamEvent) {
    if (event.type === "status") {
      setProgressStatus(event.message);
    } else if (event.type === "tool-start") {
      setProgressTools((prev) => [...prev, { done: false, name: event.name }]);
    } else if (event.type === "tool-end") {
      setProgressTools((prev) =>
        prev.map((t) => (t.name === event.name ? { ...t, done: true } : t)),
      );
    } else if (event.type === "text-delta") {
      accumulatedTextRef.current += event.text;
      const fields = tryExtractPartialFields(accumulatedTextRef.current);
      if (fields.length > 0) {
        setPartialFields(fields);
      }
    }
  }

  async function handleResumeChange(file: File | null) {
    setResumeFile(file);
    setResumePayload(null);
    setManualQuestions([]);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    accumulatedTextRef.current = "";

    if (!file) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsAnalyzingResume(true);

    try {
      // Step 1: stream parse resume profile
      const formData = new FormData();
      formData.append("resume", file);

      const parseResponse = await fetch("/api/interview/parse-resume", {
        body: formData,
        method: "POST",
        signal: abortController.signal,
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

      await readNdjsonStream<AnalysisStreamEvent>(
        parseResponse,
        (event) => {
          handleStreamEvent(event);
          if (event.type === "result") {
            parseResult = event.data as ParseResult;
          }
          if (event.type === "error") {
            streamError = event.message;
          }
        },
        abortController.signal,
      );

      if (streamError) {
        throw new Error(streamError);
      }

      if (!parseResult) {
        throw new Error("简历解析未返回有效结果");
      }

      const { fileName, resumeProfile } = parseResult as ParseResult;

      // Fill form immediately with profile
      form.setFieldValue("candidateName", resumeProfile.name);
      form.setFieldValue("targetRole", resumeProfile.targetRoles[0] ?? "");
      setResumePayload({
        fileName,
        interviewQuestions: [],
        resumeProfile,
      });
      setIsAnalyzingResume(false);
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";
      toast.success("简历解析完成，已回填候选人信息");

      // Step 2: stream generate interview questions
      setIsGeneratingQuestions(true);
      setProgressStatus("正在生成面试题…");

      const qResponse = await fetch("/api/interview/generate-questions", {
        body: JSON.stringify({ resumeProfile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!qResponse.ok) {
        const errBody = (await qResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "面试题生成失败");
      }

      let questions: InterviewQuestion[] | null = null;
      streamError = null;

      await readNdjsonStream<AnalysisStreamEvent>(
        qResponse,
        (event) => {
          handleStreamEvent(event);
          if (event.type === "result") {
            const data = event.data as { interviewQuestions?: InterviewQuestion[] };
            questions = data.interviewQuestions ?? null;
          }
          if (event.type === "error") {
            streamError = event.message;
          }
        },
        abortController.signal,
      );

      if (streamError) {
        throw new Error(streamError);
      }

      if (questions) {
        const nextQuestions = questions;
        setResumePayload((prev) => (prev ? { ...prev, interviewQuestions: nextQuestions } : null));
        toast.success("面试题生成完成");
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
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
      abortControllerRef.current = null;
      setIsAnalyzingResume(false);
      setIsGeneratingQuestions(false);
      setProgressStatus("");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";
    }
  }

  const handleCancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    accumulatedTextRef.current = "";
    const fileInput = document.querySelector("#resume-upload") as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
    toast.info("已取消简历分析");
  }, []);

  return (
    <Dialog
      onOpenChange={(value) => {
        if (isTutorialDialog) {
          return;
        }
        if (!isAnalyzingResume && !isGeneratingQuestions) {
          setOpen(value);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUpIcon className="size-4" />
          新建简历记录
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] sm:max-w-5xl gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => {
          if (isAnalyzingResume || isGeneratingQuestions || isTutorialDialog) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isAnalyzingResume || isGeneratingQuestions || isTutorialDialog) {
            e.preventDefault();
          }
        }}
        showCloseButton={!isAnalyzingResume && !isGeneratingQuestions && !isTutorialDialog}
      >
        <form
          className="flex max-h-[90vh] flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isTutorialDialog) {
              void form.handleSubmit();
            }
          }}
        >
          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            value={activeTab}
            onValueChange={isTutorialDialog ? undefined : setActiveTab}
          >
            <DialogHeader className="border-b px-6 pt-5 pb-2">
              <DialogTitle>新建简历记录</DialogTitle>
              <DialogDescription>
                支持手动录入候选人资料，也可以先上传 PDF 简历自动分析并回填表单。
              </DialogDescription>
              <TabsList className="mt-0">
                <TabsTrigger className="min-w-[6em]" value="basic">
                  基础信息
                </TabsTrigger>
                <TabsTrigger className="min-w-[6em]" value="questions">
                  面试题目
                  {resolveQuestionsTabSuffix({
                    displayQuestions,
                    isTutorialDialog,
                  })}
                </TabsTrigger>
              </TabsList>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <TabsContent className="mt-0" value="basic">
                <div className="space-y-5">
                  <div className="grid gap-4">
                    <FieldGroup className="gap-2">
                      <FieldLabel htmlFor="resume-upload">简历 PDF</FieldLabel>
                      <Input
                        accept="application/pdf"
                        disabled={isAnalyzingResume || isSubmitting}
                        id="resume-upload"
                        onChange={(event) =>
                          void handleResumeChange(event.target.files?.[0] ?? null)
                        }
                        type="file"
                      />
                      <p className="text-muted-foreground text-sm">
                        选填。上传后会调用现有简历分析接口，自动回填候选人姓名、岗位和题目数据。
                      </p>
                      {resumeFile ? (
                        <p className="break-all text-muted-foreground text-sm">{resumeFile.name}</p>
                      ) : null}
                      {resumePayload ? (
                        <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm">
                          <p className="flex items-center gap-2 font-medium">
                            <SparklesIcon className="size-4 text-amber-500" />
                            已完成简历分析
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

                  <FieldGroup
                    className="grid gap-5 md:grid-cols-2 md:items-start"
                    data-tour="studio-dialog-basic"
                  >
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
                              <FieldDescription>可选，方便后台检索与跟进。</FieldDescription>
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

                  <div data-tour="studio-dialog-schedule">
                    <InterviewScheduleFields form={form} />
                  </div>

                  <form.Field name="notes">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);

                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>内部备注</FieldLabel>
                          <FieldContent className="gap-2">
                            <Textarea
                              aria-invalid={!!errors?.length}
                              className="min-h-32 w-full"
                              id={field.name}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="记录候选人来源、业务线、面试关注点等信息"
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

              <TabsContent className="mt-0" value="questions" data-tour="studio-dialog-questions">
                <InterviewQuestionsFields
                  disabled={isSubmitting || isAnalyzingResume || isGeneratingQuestions}
                  onChange={(questions) => {
                    if (resumePayload) {
                      setResumePayload((prev) =>
                        prev ? { ...prev, interviewQuestions: questions } : prev,
                      );
                    } else {
                      setManualQuestions(questions);
                    }
                  }}
                  questions={displayQuestions}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="border-t px-6 py-4" data-tour="studio-dialog-submit">
            <Button
              disabled={isSubmitting || isAnalyzingResume || isGeneratingQuestions}
              type="submit"
            >
              {isSubmitting || isAnalyzingResume || isGeneratingQuestions ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存简历记录
            </Button>
          </DialogFooter>
        </form>

        {(isAnalyzingResume || isGeneratingQuestions) && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 rounded-lg bg-white/60 backdrop-blur-sm dark:bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" />
            {progressStatus ? (
              <p className="text-sm font-medium text-foreground">{progressStatus}</p>
            ) : (
              <motion.div layout className="flex items-center text-lg font-medium text-foreground">
                <span>正在</span>
                <TextFlip as={motion.span} interval={2.5} layout>
                  <span>解析简历</span>
                  <span>提取信息</span>
                  <span>分析简历</span>
                  <span>评估技能</span>
                </TextFlip>
              </motion.div>
            )}
            {progressTools.length > 0 && (
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {progressTools.map((t) => (
                  <div key={t.name} className="flex items-center gap-1.5">
                    {t.done ? (
                      <CheckIcon className="size-3 text-green-500" />
                    ) : (
                      <WrenchIcon className="size-3 animate-pulse" />
                    )}
                    <span>{t.name}</span>
                  </div>
                ))}
              </div>
            )}
            {partialFields.length > 0 && (
              <div className="mx-auto grid w-full max-w-xs grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-background/80 px-4 py-3 text-xs">
                {partialFields.map((f) => (
                  <div key={f.label} className="contents">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="truncate font-medium text-foreground">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleCancelAnalysis}>
              取消
            </Button>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
