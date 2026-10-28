"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { IconArrowBackUp, IconCheck } from "@tabler/icons-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { INTERVIEW_QUESTION_DIFFICULTY_OPTIONS } from "@app/db-schema/interview-question-templates";
import {
  candidateFormAgentFieldLabels,
  candidateFormAgentFields,
  candidateFormAgentPatchSchema,
  candidateFormAgentPatchMatches,
  findCandidateFormAgentPatchConflicts,
  resolveCandidateFormAgentQuestions,
} from "@app/shared/candidate-form-agent";
import type { CandidateFormAgentPatch } from "@app/shared/candidate-form-agent";
import {
  findInterviewQuestionAgentPatchConflicts,
  interviewQuestionAgentPatchMatches,
  interviewQuestionAgentFieldLabels,
  interviewQuestionAgentFields,
  interviewQuestionAgentPatchSchema,
  resolveInterviewQuestionAgentQuestions,
} from "@app/shared/interview-question-agent";
import type { InterviewQuestionAgentPatch } from "@app/shared/interview-question-agent";
import {
  applyJobDescriptionAgentChanges,
  findJobDescriptionAgentPatchConflicts,
  jobDescriptionAgentPatchMatches,
  jobDescriptionAgentFieldLabels,
  jobDescriptionAgentFields,
  jobDescriptionAgentPatchSchema,
} from "@app/shared/job-description-agent";
import type {
  JobDescriptionAgentField,
  JobDescriptionAgentPatch,
} from "@app/shared/job-description-agent";
import { SUBJECT_AGENT_JOB_SCOPE_LABELS } from "@app/shared/subject-agent-references";
import type {
  SubjectAgentDisplayValues,
  SubjectAgentJobBinding,
} from "@app/shared/subject-agent-references";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecruitingChatCard } from "@/components/assistant-ui/recruiting-chat-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CardFooter, CardHeader, CardPanel } from "@/components/ui/card";
import { useSubjectAgent } from "./subject-agent-context";
import type { SubjectAgentFormBridge } from "./subject-agent-context";

interface PatchDisplayItem {
  label: string;
  lines: string[];
}

/** 补丁的值是否已在当前表单中、是否已在最近一次保存的版本中。 */
interface PatchMatch {
  current: boolean;
  saved: boolean;
}

/** 补丁在某个表单上的行为：冲突字段名、应用后返回撤销操作、与表单的一致性。表单不匹配时返回 null。 */
interface PatchBehavior {
  apply: (bridge: SubjectAgentFormBridge) => (() => void) | null;
  findConflicts: (bridge: SubjectAgentFormBridge) => string[] | null;
  match: (bridge: SubjectAgentFormBridge) => PatchMatch | null;
}

/**
 * 卡片状态由当前表单与保存版本实时推导，不写入聊天记录（应用只影响本人的未保存表单，ADR-0045）：
 * pending 表单还不是补丁的值；applied 已填入但未保存；saved 已保存生效。刷新后未保存的修改会丢失，
 * 卡片随之回到 pending。
 */
type PatchCardState = "applied" | "pending" | "saved";

const PATCH_STATE_LABELS = {
  applied: "已填入表单，未保存",
  pending: "修改建议",
  saved: "已保存生效",
} satisfies Record<PatchCardState, string>;

const FORM_NOT_READY = "表单尚未就绪，请稍后再试。";
function noopUnsubscribe(): void {
  // 表单尚未登记时没有需要取消的订阅。
}

function readPatchCardState(
  behavior: PatchBehavior,
  bridge: SubjectAgentFormBridge | null,
): PatchCardState {
  const match = bridge ? behavior.match(bridge) : null;
  if (!match?.current) {
    return "pending";
  }
  return match.saved ? "saved" : "applied";
}

/** 订阅表单变化，实时计算卡片状态。 */
function usePatchCardState(behavior: PatchBehavior): PatchCardState {
  const { formBridge } = useSubjectAgent();
  const subscribe = useCallback(
    (listener: () => void) => formBridge?.subscribe(listener) ?? noopUnsubscribe,
    [formBridge],
  );
  return useSyncExternalStore(
    subscribe,
    () => readPatchCardState(behavior, formBridge),
    () => "pending",
  );
}

function SubjectPatchCard({
  behavior,
  items,
  summary,
  toolCallId,
}: {
  behavior: PatchBehavior;
  items: PatchDisplayItem[];
  summary: string;
  toolCallId: string;
}) {
  const { appliedPatches, clearAppliedPatch, getFormBridge, markPatchApplied } = useSubjectAgent();
  const [conflicts, setConflicts] = useState<string[]>([]);
  const state = usePatchCardState(behavior);
  // 撤销快照只在本次访问内存在，且只在表单仍是补丁的值时可用，避免覆盖之后的手动修改。
  const undo = state === "applied" ? appliedPatches.get(toolCallId) : undefined;

  const apply = () => {
    const bridge = getFormBridge();
    const revert = bridge ? behavior.apply(bridge) : null;
    setConflicts([]);
    if (!revert) {
      toast.error(FORM_NOT_READY);
      return;
    }
    markPatchApplied(toolCallId, revert);
    toast.success("已填入表单，点击“保存”后生效。");
  };

  const requestApply = () => {
    const bridge = getFormBridge();
    const changed = bridge ? behavior.findConflicts(bridge) : null;
    if (!changed) {
      toast.error(FORM_NOT_READY);
      return;
    }
    if (changed.length > 0) {
      setConflicts(changed);
      return;
    }
    apply();
  };

  return (
    <RecruitingChatCard className="aui-subject-patch" render={<article />}>
      <CardHeader className="gap-0 p-3 pb-0">
        <p
          className={cn(
            "inline-flex items-center gap-1 text-muted-foreground text-xs",
            state === "saved" && "text-success-foreground",
          )}
        >
          {state === "pending" ? null : <IconCheck aria-hidden="true" className="size-3.5" />}
          {PATCH_STATE_LABELS[state]}
        </p>
        <h3 className="mt-1 font-medium text-sm leading-6">{summary}</h3>
      </CardHeader>
      <CardPanel className="p-3 pt-2">
        <dl className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg bg-muted/40 px-2.5 py-2">
              <dt className="text-muted-foreground text-xs">{item.label}</dt>
              {item.lines.map((line, index) => (
                <dd
                  // oxlint-disable-next-line react/no-array-index-key -- Display lines are derived from an immutable patch and have no identity.
                  key={index}
                  className="mt-0.5 line-clamp-4 whitespace-pre-wrap wrap-break-word text-sm"
                >
                  {line}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </CardPanel>
      {state === "saved" ? null : (
        <CardFooter className="items-center justify-end gap-2 p-3 pt-0">
          {state === "applied" ? (
            <span className="me-auto text-muted-foreground text-xs">点击页面“保存”后生效</span>
          ) : null}
          {state === "pending" ? (
            <Button onClick={requestApply} size="sm" type="button">
              应用到表单
            </Button>
          ) : null}
          {undo ? (
            <Button
              onClick={() => {
                undo();
                clearAppliedPatch(toolCallId);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconArrowBackUp className="size-3.5" />
              撤销
            </Button>
          ) : null}
        </CardFooter>
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConflicts([]);
          }
        }}
        open={conflicts.length > 0}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>表单内容已变化</AlertDialogTitle>
            <AlertDialogDescription>
              {`生成这条建议后，${conflicts.map((label) => `“${label}”`).join("、")}已被修改。应用会覆盖当前内容，可以随后撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>仍要应用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RecruitingChatCard>
  );
}

const CLEARED = "（清空）";

/** 作用范围与绑定岗位的展示：岗位优先用 Server 解析的名称。 */
function formatJobBindingItems(
  changes: Partial<SubjectAgentJobBinding>,
  displayValues: SubjectAgentDisplayValues | undefined,
): PatchDisplayItem[] {
  const items: PatchDisplayItem[] = [];
  if (changes.scope !== undefined) {
    items.push({ label: "作用范围", lines: [SUBJECT_AGENT_JOB_SCOPE_LABELS[changes.scope]] });
  }
  if (changes.jobDescriptionIds !== undefined) {
    const names = displayValues?.jobDescriptionIds || changes.jobDescriptionIds.join("、");
    items.push({ label: "绑定岗位", lines: [names || CLEARED] });
  }
  return items;
}

// ---- 岗位 ----

const PRIORITY_LABELS = { high: "高", low: "低", medium: "中" } as const;

function formatJobDescriptionChange(
  patch: JobDescriptionAgentPatch,
  field: JobDescriptionAgentField,
): string {
  const value = patch.changes[field];
  const displayValue = patch.displayValues?.[field];
  if (displayValue) {
    return displayValue;
  }
  if (value === null || value === undefined || value === "") {
    return CLEARED;
  }
  if (value === true || value === false) {
    return value ? "开启" : "关闭";
  }
  if (Array.isArray(value)) {
    return value.join("、") || CLEARED;
  }
  if (field === "priority" && patch.changes.priority) {
    return PRIORITY_LABELS[patch.changes.priority];
  }
  return String(value);
}

export function JobDescriptionPatchCard({
  patch,
  toolCallId,
}: {
  patch: JobDescriptionAgentPatch;
  toolCallId: string;
}) {
  const fields = jobDescriptionAgentFields.filter((field) => patch.changes[field] !== undefined);
  const behavior: PatchBehavior = {
    apply: (bridge) => {
      if (bridge.kind !== "job_description") {
        return null;
      }
      const changeSet = applyJobDescriptionAgentChanges(patch.changes, bridge.getPageContext());
      bridge.write(changeSet.next);
      return () => bridge.write(changeSet.previous);
    },
    findConflicts: (bridge) =>
      bridge.kind === "job_description"
        ? findJobDescriptionAgentPatchConflicts(patch, bridge.getPageContext()).map(
            (field) => jobDescriptionAgentFieldLabels[field],
          )
        : null,
    match: (bridge) => {
      if (bridge.kind !== "job_description") {
        return null;
      }
      const saved = bridge.getSavedContext();
      return {
        current: jobDescriptionAgentPatchMatches(patch, bridge.getPageContext()),
        saved: saved ? jobDescriptionAgentPatchMatches(patch, saved) : false,
      };
    },
  };
  return (
    <SubjectPatchCard
      behavior={behavior}
      items={fields.map((field) => ({
        label: jobDescriptionAgentFieldLabels[field],
        lines: [formatJobDescriptionChange(patch, field)],
      }))}
      summary={patch.summary}
      toolCallId={toolCallId}
    />
  );
}

export const JobDescriptionPatchToolUI = makeAssistantToolUI<unknown, unknown>({
  // 运行中与被拒绝的状态由工具调用条展示，这里只渲染可应用的补丁。
  render: ({ result, toolCallId }) => {
    const parsed = jobDescriptionAgentPatchSchema.safeParse(result);
    return parsed.success ? (
      <JobDescriptionPatchCard patch={parsed.data} toolCallId={toolCallId} />
    ) : null;
  },
  toolName: "propose_job_description_patch",
});

/** 标题、描述、适用范围和题目列表补丁：写入要改的字段，并记下撤销所需的原值。 */
interface QuestionListValues<Question> extends SubjectAgentJobBinding {
  description: string;
  questions: Question[];
  title: string;
}

interface QuestionListChangeSet<Question> {
  next: Partial<QuestionListValues<Question>>;
  previous: Partial<QuestionListValues<Question>>;
}

function buildQuestionListChangeSet<Question>(
  changes: Partial<SubjectAgentJobBinding> & {
    description?: string;
    questions?: readonly object[];
    title?: string;
  },
  current: QuestionListValues<Question>,
  resolveQuestions: () => Question[] | null,
): QuestionListChangeSet<Question> {
  const next: Partial<QuestionListValues<Question>> = {};
  const previous: Partial<QuestionListValues<Question>> = {};
  if (changes.title !== undefined) {
    next.title = changes.title;
    previous.title = current.title;
  }
  if (changes.description !== undefined) {
    next.description = changes.description;
    previous.description = current.description;
  }
  if (changes.scope !== undefined) {
    next.scope = changes.scope;
    previous.scope = current.scope;
  }
  if (changes.jobDescriptionIds !== undefined) {
    next.jobDescriptionIds = changes.jobDescriptionIds;
    previous.jobDescriptionIds = current.jobDescriptionIds;
  }
  const questions = resolveQuestions();
  if (questions) {
    next.questions = questions;
    previous.questions = current.questions;
  }
  return { next, previous };
}

// ---- 沟通题 ----

const DIFFICULTY_LABELS = Object.fromEntries(
  INTERVIEW_QUESTION_DIFFICULTY_OPTIONS.map((option) => [option.value, option.label]),
);

function InterviewQuestionPatchCard({
  patch,
  toolCallId,
}: {
  patch: InterviewQuestionAgentPatch;
  toolCallId: string;
}) {
  const { changes } = patch;
  const items = interviewQuestionAgentFields.flatMap((field): PatchDisplayItem[] => {
    const label = interviewQuestionAgentFieldLabels[field];
    if (field === "questions") {
      return changes.questions
        ? [
            {
              label: `${label}（共 ${changes.questions.length} 题）`,
              lines: changes.questions.map(
                (question, index) =>
                  `${index + 1}. [${DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}] ${question.content}`,
              ),
            },
          ]
        : [];
    }
    if (field === "scope" || field === "jobDescriptionIds") {
      return formatJobBindingItems({ [field]: changes[field] }, patch.displayValues);
    }
    const value = changes[field];
    return value === undefined ? [] : [{ label, lines: [value || CLEARED] }];
  });
  const behavior: PatchBehavior = {
    apply: (bridge) => {
      if (bridge.kind !== "interview_question_template") {
        return null;
      }
      const current = bridge.getPageContext();
      const { next, previous } = buildQuestionListChangeSet(changes, current, () =>
        changes.questions
          ? resolveInterviewQuestionAgentQuestions(changes.questions, current, () =>
              crypto.randomUUID(),
            )
          : null,
      );
      bridge.write(next);
      return () => bridge.write(previous);
    },
    findConflicts: (bridge) =>
      bridge.kind === "interview_question_template"
        ? findInterviewQuestionAgentPatchConflicts(patch, bridge.getPageContext()).map(
            (field) => interviewQuestionAgentFieldLabels[field],
          )
        : null,
    match: (bridge) => {
      if (bridge.kind !== "interview_question_template") {
        return null;
      }
      const saved = bridge.getSavedContext();
      return {
        current: interviewQuestionAgentPatchMatches(patch, bridge.getPageContext()),
        saved: saved ? interviewQuestionAgentPatchMatches(patch, saved) : false,
      };
    },
  };
  return (
    <SubjectPatchCard
      behavior={behavior}
      items={items}
      summary={patch.summary}
      toolCallId={toolCallId}
    />
  );
}

export const InterviewQuestionPatchToolUI = makeAssistantToolUI<unknown, unknown>({
  // 运行中与被拒绝的状态由工具调用条展示，这里只渲染可应用的补丁。
  render: ({ result, toolCallId }) => {
    const parsed = interviewQuestionAgentPatchSchema.safeParse(result);
    return parsed.success ? (
      <InterviewQuestionPatchCard patch={parsed.data} toolCallId={toolCallId} />
    ) : null;
  },
  toolName: "propose_interview_question_patch",
});

// ---- 表单题 ----

const QUESTION_TYPE_LABELS = { multi: "多选", single: "单选", text: "填写" } as const;

function CandidateFormPatchCard({
  patch,
  toolCallId,
}: {
  patch: CandidateFormAgentPatch;
  toolCallId: string;
}) {
  const { changes } = patch;
  const items = candidateFormAgentFields.flatMap((field): PatchDisplayItem[] => {
    const label = candidateFormAgentFieldLabels[field];
    if (field === "questions") {
      return changes.questions
        ? [
            {
              label: `${label}（共 ${changes.questions.length} 题）`,
              lines: changes.questions.map((question, index) => {
                const options =
                  question.options.length > 0
                    ? `：${question.options.map((option) => option.label).join(" / ")}`
                    : "";
                const required = question.required ? "（必填）" : "";
                return `${index + 1}. [${QUESTION_TYPE_LABELS[question.type]}] ${question.label}${required}${options}`;
              }),
            },
          ]
        : [];
    }
    if (field === "scope" || field === "jobDescriptionIds") {
      return formatJobBindingItems({ [field]: changes[field] }, patch.displayValues);
    }
    const value = changes[field];
    return value === undefined ? [] : [{ label, lines: [value || CLEARED] }];
  });
  const behavior: PatchBehavior = {
    apply: (bridge) => {
      if (bridge.kind !== "candidate_form_template") {
        return null;
      }
      const current = bridge.getPageContext();
      const { next, previous } = buildQuestionListChangeSet(changes, current, () =>
        changes.questions
          ? resolveCandidateFormAgentQuestions(changes.questions, current, () =>
              crypto.randomUUID(),
            )
          : null,
      );
      bridge.write(next);
      return () => bridge.write(previous);
    },
    findConflicts: (bridge) =>
      bridge.kind === "candidate_form_template"
        ? findCandidateFormAgentPatchConflicts(patch, bridge.getPageContext()).map(
            (field) => candidateFormAgentFieldLabels[field],
          )
        : null,
    match: (bridge) => {
      if (bridge.kind !== "candidate_form_template") {
        return null;
      }
      const saved = bridge.getSavedContext();
      return {
        current: candidateFormAgentPatchMatches(patch, bridge.getPageContext()),
        saved: saved ? candidateFormAgentPatchMatches(patch, saved) : false,
      };
    },
  };
  return (
    <SubjectPatchCard
      behavior={behavior}
      items={items}
      summary={patch.summary}
      toolCallId={toolCallId}
    />
  );
}

export const CandidateFormPatchToolUI = makeAssistantToolUI<unknown, unknown>({
  // 运行中与被拒绝的状态由工具调用条展示，这里只渲染可应用的补丁。
  render: ({ result, toolCallId }) => {
    const parsed = candidateFormAgentPatchSchema.safeParse(result);
    return parsed.success ? (
      <CandidateFormPatchCard patch={parsed.data} toolCallId={toolCallId} />
    ) : null;
  },
  toolName: "propose_candidate_form_patch",
});
