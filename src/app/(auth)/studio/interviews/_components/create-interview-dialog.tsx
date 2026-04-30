"use client";

import type { InterviewQuestion, ResumeAnalysisResult, ResumeProfile } from "@/lib/interview/types";
import type { StudioInterviewRecord } from "@/lib/studio-interviews";
import type { AnalysisStreamEvent } from "@/server/agents/resume-analysis-agent";
import { useStore } from "@tanstack/react-form";
import { CheckIcon, FileUpIcon, LoaderCircleIcon, SparklesIcon, WrenchIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
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
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import {
  createInterviewFormValues,
  normalizeInterviewQuestions,
  useInterviewForm,
} from "./interview-form";
import { InterviewBasicInfoFields, InterviewNotesField } from "./interview-form/basic-info-fields";
import { buildInterviewFormData } from "./interview-form/build-form-data";
import { InterviewQuestionsFields } from "./interview-questions-fields";
import { InterviewScheduleFields } from "./interview-schedule-fields";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

function resolveQuestionsTabSuffix(questionCount: number) {
  if (questionCount > 0) {
    return ` (${questionCount})`;
  }
  return "";
}

type ResumeSummary = Pick<ResumeAnalysisResult, "fileName" | "resumeProfile">;

// oxlint-disable-next-line complexity -- Create dialog owns form, upload, schedule, and interview-questions flows together; extracting pieces fragments state.
export function CreateInterviewDialog({
  onCreated,
}: {
  onCreated: (record: StudioInterviewRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeSummary | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const accumulatedTextRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
      // 通用字段 + 简历由共享 helper 组装；问题字段需要二选一处理（带 LLM 解析时附 resumePayload，
      // 否则附 manualInterviewQuestions），所以走自定义分支。
      // Common fields + resume go through the shared helper; the question payload is
      // either `resumePayload` (LLM-analysed) or `manualInterviewQuestions`, so it
      // gets a custom branch.
      const normalizedQuestions = normalizeInterviewQuestions(values.interviewQuestions);
      const formData = buildInterviewFormData(values, {
        questionsFieldName: null,
        resumeFile,
      });

      if (resumePayload) {
        formData.append(
          "resumePayload",
          JSON.stringify({
            fileName: resumePayload.fileName,
            interviewQuestions: normalizedQuestions,
            resumeProfile: resumePayload.resumeProfile,
          } satisfies ResumeAnalysisResult),
        );
      } else if (normalizedQuestions.length > 0) {
        formData.append("manualInterviewQuestions", JSON.stringify(normalizedQuestions));
      }

      try {
        const created = await apiFetch<StudioInterviewRecord>("/api/studio/interviews", {
          body: formData,
          method: "POST",
        });
        onCreated(created);
        setOpen(false);
        setResumeFile(null);
        setResumePayload(null);
        form.reset(createInterviewFormValues());
        toast.success("简历库记录已创建");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "创建失败");
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

  const questionCount = useStore(form.store, (state) => state.values.interviewQuestions.length);

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
    form.setFieldValue("interviewQuestions", []);
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
        resumeProfile,
      });
      setIsAnalyzingResume(false);
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";
      toast.success("简历解析完成，已回填候选人信息");

      // Match best in-flight job description; non-fatal on failure.
      void (async () => {
        try {
          const matchResponse = await fetch("/api/interview/match-job-description", {
            body: JSON.stringify({ resumeProfile }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
            signal: abortController.signal,
          });
          if (!matchResponse.ok) {
            return;
          }
          const matchPayload = (await matchResponse.json().catch(() => null)) as {
            matchedId?: string | null;
            reason?: string | null;
          } | null;
          if (matchPayload?.matchedId) {
            form.setFieldValue("jobDescriptionId", matchPayload.matchedId);
            toast.success(
              matchPayload.reason ? `已匹配在招岗位：${matchPayload.reason}` : "已自动匹配在招岗位",
            );
          }
        } catch {
          // swallow — user can still pick manually
        }
      })();

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
        form.setFieldValue("interviewQuestions", questions);
        toast.success("面试题生成完成");
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      if (!resumePayload?.resumeProfile) {
        setResumePayload(null);
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
        if (!isAnalyzingResume && !isGeneratingQuestions) {
          setOpen(value);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto" variant="outline">
          <FileUpIcon className="size-4" />
          新建简历记录
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] sm:max-w-5xl gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => {
          if (isAnalyzingResume || isGeneratingQuestions) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isAnalyzingResume || isGeneratingQuestions) {
            e.preventDefault();
          }
        }}
        showCloseButton={!isAnalyzingResume && !isGeneratingQuestions}
      >
        <form
          className="flex max-h-[90vh] flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <DialogHeader className="border-b px-6 pt-5 pb-2">
              <DialogTitle>新建简历记录</DialogTitle>
              <DialogDescription>
                支持手动录入候选人资料，也可以先上传 PDF 简历自动分析并回填表单。
              </DialogDescription>
              <TabsList className="mt-0">
                <TabsTrigger className="min-w-[8em]" value="basic">
                  基础信息
                </TabsTrigger>
                <TabsTrigger className="min-w-[8em]" value="questions">
                  面试题目
                  {resolveQuestionsTabSuffix(questionCount)}
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
                            {questionCount} 道题
                          </p>
                        </div>
                      ) : null}
                    </FieldGroup>
                  </div>

                  <InterviewBasicInfoFields form={form} />

                  <InterviewScheduleFields form={form} />

                  <InterviewNotesField form={form} />
                </div>
              </TabsContent>

              <TabsContent className="mt-0" value="questions">
                <InterviewQuestionsFields
                  disabled={isSubmitting || isAnalyzingResume || isGeneratingQuestions}
                  form={form}
                  resetKey={open ? "create-open" : "create-closed"}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="border-t px-6 py-4">
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
