"use client";

import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/shared/interview/types";
import type { StudioInterviewRecord } from "@/lib/shared/studio-interviews";
import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";
import { useStore } from "@tanstack/react-form";
import { CheckIcon, FileUpIcon, LoaderCircleIcon, SparklesIcon, WrenchIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatedHeight } from "@/components/animated-height";
import { ResumeDedupOverlay } from "@/components/resume-dedup-overlay";
import { TextFlip } from "@/components/text-flip";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DedupMatchRecord } from "@/lib/client/api";
import { apiFetch, fetchInterviewDedup } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { rpc } from "@/lib/client/rpc";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
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
  const slug = useWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeSummary | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  const accumulatedTextRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  // 缓存 Step 1 解析结果，用户在身份查重弹窗点"继续解析"时再驱动 Step 2。
  // Cache the Step 1 parse result so we can resume Step 2 after the user
  // clicks "继续解析" on the dedup overlay.
  const pendingProfileRef = useRef<ResumeProfile | null>(null);

  // 清空 dialog 内除表单之外的所有临时态：简历文件、分析中间结果、进度、文件
  // input 的 DOM value、活动 tab，并 abort 任何还在跑的请求。表单字段由调用
  // 方紧随其后用 form.reset(createInterviewFormValues()) 重置——拆开避免和
  // 同一渲染中后定义的 form 形成循环引用。
  // Reset all transient dialog state EXCEPT the form. Callers follow this with
  // form.reset(createInterviewFormValues()). The split avoids a circular
  // reference with the form created later in the same render.
  const resetTransientDialogState = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    setActiveTab("basic");
    const fileInput = document.querySelector("#resume-upload") as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  }, []);

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
        resetTransientDialogState();
        form.reset(createInterviewFormValues());
        toast.success("面试记录已创建");
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

  async function runQuestionGeneration(resumeProfile: ResumeProfile) {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGeneratingQuestions(true);
    setProgressStatus("正在生成面试题…");
    setProgressTools([]);
    setPartialFields([]);
    accumulatedTextRef.current = "";

    try {
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
      let streamError: string | null = null;

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
      toast.error(error instanceof Error ? error.message : "面试题生成失败");
    } finally {
      abortControllerRef.current = null;
      setIsGeneratingQuestions(false);
      setProgressStatus("");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";
    }
  }

  // oxlint-disable-next-line complexity -- Orchestrates parse → fill form → JD match → dedup branch → optional Step 2; extracting fragments the shared state.
  async function handleResumeChange(file: File | null) {
    setResumeFile(file);
    setResumePayload(null);
    setDedupMatches(null);
    pendingProfileRef.current = null;
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
      form.setFieldValue("candidateEmail", resumeProfile.email ?? "");
      form.setFieldValue("candidatePhone", resumeProfile.phone ?? "");
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
          const matchResponse = await rpc.api.interview["match-job-description"].$post(
            { json: { resumeProfile } },
            { init: { signal: abortController.signal } },
          );
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

      // 身份维度查重：simple OR-match by name/email/phone。失败时静默继续。
      // Identity dedup check; on failure proceed silently (don't block the upload).
      let dedupHit = false;
      try {
        const { matches } = await fetchInterviewDedup(slug, {
          email: resumeProfile.email,
          name: resumeProfile.name,
          phone: resumeProfile.phone,
        });
        if (matches.length > 0) {
          dedupHit = true;
          pendingProfileRef.current = resumeProfile;
          setDedupMatches(matches);
          // 此处不抛、不继续 Step 2 —— finally 会把 abortController 清掉，
          // 等用户点"继续解析"时再用新的 abortController 启动 Step 2。
          // Don't throw, don't run Step 2 — the finally block clears the
          // abortController; "继续解析" spins up a fresh one for Step 2.
          return;
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          toast.warning(
            error instanceof Error
              ? `身份查重失败，已跳过：${error.message}`
              : "身份查重失败，已跳过",
          );
        }
      }

      if (!dedupHit) {
        // Step 2 inline (fresh-controller branch handled by runQuestionGeneration on continue).
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

  function handleDedupContinue() {
    const profile = pendingProfileRef.current;
    setDedupMatches(null);
    pendingProfileRef.current = null;
    if (profile) {
      void runQuestionGeneration(profile);
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
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    const fileInput = document.querySelector("#resume-upload") as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
    toast.info("已取消简历分析");
  }, []);

  // 等待用户决定时的 overlay 也算"忙"——禁止关闭外层弹窗，避免在用户决定前丢状态。
  // The dedup-confirmation overlay also counts as "busy" so the outer modal
  // cannot be dismissed before the user decides.
  const isBusy = isAnalyzingResume || isGeneratingQuestions || Boolean(dedupMatches);

  return (
    <>
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)} type="button">
        <FileUpIcon className="size-4" />
        新建面试记录
      </Button>
      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <Modal
          open={open}
          onOpenChange={(value) => {
            if (isBusy) {
              return;
            }
            setOpen(value);
            if (!value) {
              resetTransientDialogState();
              form.reset(createInterviewFormValues());
            }
          }}
          title="新建面试记录"
          description="支持手动录入候选人资料，也可以先上传 PDF 简历自动分析并回填表单。"
          size="2xl"
          dismissible={!isBusy}
          showCloseButton={!isBusy}
          headerExtra={
            <TabsList className="mt-2">
              <TabsTrigger className="min-w-[8em]" value="basic">
                基础信息
              </TabsTrigger>
              <TabsTrigger className="min-w-[8em]" value="questions">
                面试题目
                {resolveQuestionsTabSuffix(questionCount)}
              </TabsTrigger>
            </TabsList>
          }
          footer={
            <Button disabled={isSubmitting || isBusy} form="create-interview-form" type="submit">
              {isSubmitting || isBusy ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              保存面试记录
            </Button>
          }
        >
          <form
            id="create-interview-form"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <AnimatedHeight>
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
                          <p className="mt-1 break-words text-muted-foreground leading-normal">
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
            </AnimatedHeight>

            {isBusy && (
              <motion.div
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-white/80 px-6 py-8 backdrop-blur-sm dark:bg-black/50"
                initial={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {dedupMatches ? (
                  <ResumeDedupOverlay
                    matches={dedupMatches}
                    onCancel={handleCancelAnalysis}
                    onContinue={handleDedupContinue}
                  />
                ) : (
                  <>
                    <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" />
                    {progressStatus ? (
                      <p className="font-medium text-foreground text-sm">{progressStatus}</p>
                    ) : (
                      <motion.div
                        className="flex items-center font-medium text-foreground text-lg"
                        layout
                      >
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
                      <div className="flex flex-col gap-1.5 text-muted-foreground text-xs">
                        {progressTools.map((t) => (
                          <div className="flex items-center gap-1.5" key={t.name}>
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
                          <div className="contents" key={f.label}>
                            <span className="text-muted-foreground">{f.label}</span>
                            <span className="truncate font-medium text-foreground">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button onClick={handleCancelAnalysis} size="sm" variant="outline">
                      取消
                    </Button>
                  </>
                )}
              </motion.div>
            )}
          </form>
        </Modal>
      </Tabs>
    </>
  );
}
