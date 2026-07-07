"use client";

import {
  IconClipboardList,
  IconExternalLink,
  IconListCheck,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react";
import type { CandidateFormTemplateListRecord } from "@arc/db-schema/candidate-forms";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type { InterviewQuestionTemplateListRecord } from "@arc/db-schema/interview-question-templates";
import {
  createDefaultResumeScreeningPolicy,
  jobDescriptionFormSchema,
} from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import type {
  ResumeScreeningFieldRule,
  ResumeScreeningPolicy,
  ResumeScreeningRuleSeverity,
  ResumeScreeningSkillRule,
} from "@arc/shared/resume-screening";
import {
  buildJobDescriptionInterviewerOptions,
  filterInterviewerIdsByDepartment,
  getDepartmentSyncedInterviewerSelection,
} from "@arc/shared/job-description-interviewers";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownEditor } from "@/components/features/markdown-editor";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;
const PROMPT_MAX_LENGTH = 10_000;
const SCREENING_TEXTAREA_MAX_LENGTH = 2000;
const MIN_EDUCATION_RULE_ID = "minimum-education";
const MIN_WORK_YEARS_RULE_ID = "minimum-work-years";
const REQUIRED_SKILLS_RULE_ID = "required-skills";

type JobDescriptionFormTab = "basic" | "screening" | "interview-questions" | "forms";
type MinimumEducationRule = Extract<ResumeScreeningFieldRule, { field: "minimumEducation" }>;
type MinimumWorkYearsRule = Extract<ResumeScreeningFieldRule, { field: "minimumWorkYears" }>;

export function emptyJobDescriptionFormValues(): JobDescriptionFormValues {
  return {
    allowCrossDepartmentInterviewers: false,
    code: "",
    departmentId: "",
    description: "",
    interviewerIds: [],
    name: "",
    prompt: "",
    resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
  };
}

function toFormValues(record: JobDescriptionRecord): JobDescriptionFormValues {
  return {
    allowCrossDepartmentInterviewers: record.allowCrossDepartmentInterviewers,
    code: record.code ?? "",
    departmentId: record.departmentId,
    description: record.description ?? "",
    interviewerIds: [...record.interviewerIds],
    name: record.name,
    prompt: record.prompt,
    resumeScreeningPolicy: record.resumeScreeningPolicy,
  };
}

function toDepartmentScopedFormValues(
  record: JobDescriptionRecord,
  interviewers: InterviewerListRecord[],
): JobDescriptionFormValues {
  const values = toFormValues(record);
  return {
    ...values,
    interviewerIds: filterInterviewerIdsByDepartment(
      interviewers,
      values.departmentId,
      values.interviewerIds,
      values.allowCrossDepartmentInterviewers,
    ),
  };
}

function normalizeDepartmentId(value: string | null): string {
  return value ?? "";
}

function splitRuleLines(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinRuleLines(values: string[]) {
  return values.join("\n");
}

function upsertRule<TRule extends ResumeScreeningPolicy["rules"][number]>(
  rules: ResumeScreeningPolicy["rules"],
  nextRule: TRule,
) {
  const without = rules.filter((rule) => rule.id !== nextRule.id);
  return [...without, nextRule];
}

function removeRule(
  rules: ResumeScreeningPolicy["rules"],
  id: string,
): ResumeScreeningPolicy["rules"] {
  return rules.filter((rule) => rule.id !== id);
}

function getMinimumEducationRule(policy: ResumeScreeningPolicy) {
  return policy.rules.find(
    (rule): rule is MinimumEducationRule =>
      rule.type === "field" && rule.field === "minimumEducation",
  );
}

function getMinimumWorkYearsRule(policy: ResumeScreeningPolicy) {
  return policy.rules.find(
    (rule): rule is MinimumWorkYearsRule =>
      rule.type === "field" && rule.field === "minimumWorkYears",
  );
}

function getRequiredSkillsRule(policy: ResumeScreeningPolicy) {
  return policy.rules.find((rule): rule is ResumeScreeningSkillRule => rule.type === "skill");
}

// eslint-disable-next-line complexity -- rule editor coordinates several controlled field groups.
function ResumeScreeningPolicyFields({
  isGenerating,
  onGenerateFromJobDescription,
  policy,
  onChange,
}: {
  isGenerating?: boolean;
  onGenerateFromJobDescription?: () => void;
  policy: ResumeScreeningPolicy;
  onChange: (policy: ResumeScreeningPolicy) => void;
}) {
  const minimumEducationRule = getMinimumEducationRule(policy);
  const minimumWorkYearsRule = getMinimumWorkYearsRule(policy);
  const requiredSkillsRule = getRequiredSkillsRule(policy);
  const semanticRules = policy.rules.filter((rule) => rule.type === "semantic");
  const skillSeverity = requiredSkillsRule?.severity ?? "warning";
  const semanticSeverity = semanticRules[0]?.severity ?? "warning";

  function patchPolicy(next: Partial<ResumeScreeningPolicy>) {
    onChange({ ...policy, ...next });
  }

  function setMinimumEducation(level: MinimumEducationRule["level"]) {
    patchPolicy({
      rules: upsertRule(policy.rules, {
        field: "minimumEducation",
        id: MIN_EDUCATION_RULE_ID,
        level,
        severity: minimumEducationRule?.severity ?? "blocking",
        type: "field",
      }),
    });
  }

  function setMinimumWorkYears(value: string) {
    const years = Number.parseInt(value, 10);
    if (!Number.isFinite(years) || years <= 0) {
      patchPolicy({ rules: removeRule(policy.rules, MIN_WORK_YEARS_RULE_ID) });
      return;
    }
    patchPolicy({
      rules: upsertRule(policy.rules, {
        field: "minimumWorkYears",
        id: MIN_WORK_YEARS_RULE_ID,
        severity: minimumWorkYearsRule?.severity ?? "blocking",
        type: "field",
        years,
      }),
    });
  }

  function setRequiredSkills(value: string) {
    const requiredSkills = splitRuleLines(value);
    if (requiredSkills.length === 0) {
      patchPolicy({ rules: removeRule(policy.rules, REQUIRED_SKILLS_RULE_ID) });
      return;
    }
    const matchMode =
      requiredSkillsRule?.matchMode.type === "at_least"
        ? {
            count: Math.min(requiredSkillsRule.matchMode.count, requiredSkills.length),
            type: "at_least" as const,
          }
        : { type: "all" as const };
    patchPolicy({
      rules: upsertRule(policy.rules, {
        id: REQUIRED_SKILLS_RULE_ID,
        matchMode,
        requiredSkills,
        severity: skillSeverity,
        type: "skill",
      }),
    });
  }

  function setRequiredSkillsMatchMode(type: "all" | "at_least") {
    if (!requiredSkillsRule) {
      return;
    }
    patchPolicy({
      rules: upsertRule(policy.rules, {
        ...requiredSkillsRule,
        matchMode:
          type === "all"
            ? { type: "all" }
            : { count: Math.min(1, requiredSkillsRule.requiredSkills.length), type: "at_least" },
      }),
    });
  }

  function setRequiredSkillsMatchCount(value: string) {
    if (!requiredSkillsRule) {
      return;
    }
    const count = Number.parseInt(value, 10);
    patchPolicy({
      rules: upsertRule(policy.rules, {
        ...requiredSkillsRule,
        matchMode: {
          count: Math.max(1, Math.min(count || 1, requiredSkillsRule.requiredSkills.length)),
          type: "at_least",
        },
      }),
    });
  }

  function setSemanticRules(value: string) {
    const requirements = splitRuleLines(value);
    const nonSemanticRules = policy.rules.filter((rule) => rule.type !== "semantic");
    patchPolicy({
      rules: [
        ...nonSemanticRules,
        ...requirements.map((requirement, index) => ({
          id: `semantic-${index + 1}`,
          requirement,
          severity: semanticSeverity,
          type: "semantic" as const,
        })),
      ],
    });
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">筛选规则草稿</p>
          <p className="mt-1 text-muted-foreground text-xs">
            可从当前 JD 生成草稿，再由 HR 调整确认。
          </p>
        </div>
        {onGenerateFromJobDescription ? (
          <Button
            disabled={isGenerating}
            onClick={onGenerateFromJobDescription}
            size="sm"
            type="button"
            variant="outline"
          >
            {isGenerating ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconSparkles className="size-3.5" />
            )}
            从 JD 生成
          </Button>
        ) : null}
      </div>

      <Field>
        <Card className="gap-0 rounded-lg py-0">
          <CardContent className="flex items-center justify-between gap-4 px-3 py-2.5">
            <div className="space-y-0.5">
              <FieldLabel htmlFor="resume-screening-enabled">启用简历筛选规则</FieldLabel>
              <p className="text-muted-foreground text-xs">
                筛选结果只给出通过、需核实或暂缓推进，不会自动淘汰候选人。
              </p>
            </div>
            <Switch
              checked={policy.enabled}
              id="resume-screening-enabled"
              onCheckedChange={(enabled) => patchPolicy({ enabled })}
            />
          </CardContent>
        </Card>
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel>最低学历</FieldLabel>
          <FieldContent className="gap-2">
            <SearchableSelect
              onChange={(value) =>
                setMinimumEducation((value ?? "none") as MinimumEducationRule["level"])
              }
              options={["none", "专科", "本科", "硕士", "博士"].map((value) => ({
                label: value === "none" ? "不限" : value,
                value,
              }))}
              placeholder="不限"
              value={minimumEducationRule?.level ?? "none"}
            />
            <SearchableSelect
              onChange={(value) => {
                if (minimumEducationRule) {
                  patchPolicy({
                    rules: upsertRule(policy.rules, {
                      ...minimumEducationRule,
                      severity: (value ?? "blocking") as ResumeScreeningRuleSeverity,
                    }),
                  });
                }
              }}
              options={[
                { label: "阻断", value: "blocking" },
                { label: "提醒", value: "warning" },
                { label: "信息", value: "info" },
              ]}
              placeholder="阻断"
              value={minimumEducationRule?.severity ?? "blocking"}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="minimum-work-years">最低工作年限</FieldLabel>
          <FieldContent className="gap-2">
            <Input
              id="minimum-work-years"
              min={0}
              onChange={(event) => setMinimumWorkYears(event.target.value)}
              placeholder="不限"
              type="number"
              value={minimumWorkYearsRule?.years ?? ""}
            />
            <SearchableSelect
              onChange={(value) => {
                if (minimumWorkYearsRule) {
                  patchPolicy({
                    rules: upsertRule(policy.rules, {
                      ...minimumWorkYearsRule,
                      severity: (value ?? "blocking") as ResumeScreeningRuleSeverity,
                    }),
                  });
                }
              }}
              options={[
                { label: "阻断", value: "blocking" },
                { label: "提醒", value: "warning" },
                { label: "信息", value: "info" },
              ]}
              placeholder="阻断"
              value={minimumWorkYearsRule?.severity ?? "blocking"}
            />
          </FieldContent>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="required-skills">必备技能</FieldLabel>
        <FieldContent className="gap-3">
          <Textarea
            className="min-h-24"
            id="required-skills"
            maxLength={SCREENING_TEXTAREA_MAX_LENGTH}
            onChange={(event) => setRequiredSkills(event.target.value)}
            placeholder="每行一个技能，例如 React、TypeScript、Node.js"
            value={joinRuleLines(requiredSkillsRule?.requiredSkills ?? [])}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <SearchableSelect
              onChange={(value) => setRequiredSkillsMatchMode(value === "at_least" ? value : "all")}
              options={[
                { label: "全部满足", value: "all" },
                { label: "至少 N 项", value: "at_least" },
              ]}
              placeholder="全部满足"
              value={requiredSkillsRule?.matchMode.type ?? "all"}
            />
            <Input
              disabled={requiredSkillsRule?.matchMode.type !== "at_least"}
              min={1}
              onChange={(event) => setRequiredSkillsMatchCount(event.target.value)}
              placeholder="N"
              type="number"
              value={
                requiredSkillsRule?.matchMode.type === "at_least"
                  ? requiredSkillsRule.matchMode.count
                  : ""
              }
            />
            <SearchableSelect
              onChange={(value) => {
                if (requiredSkillsRule) {
                  patchPolicy({
                    rules: upsertRule(policy.rules, {
                      ...requiredSkillsRule,
                      severity: (value ?? "warning") as ResumeScreeningRuleSeverity,
                    }),
                  });
                }
              }}
              options={[
                { label: "阻断", value: "blocking" },
                { label: "提醒", value: "warning" },
                { label: "信息", value: "info" },
              ]}
              placeholder="提醒"
              value={skillSeverity}
            />
          </div>
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="semantic-screening-rules">其他语义要求</FieldLabel>
        <FieldContent className="gap-3">
          <Textarea
            className="min-h-28"
            id="semantic-screening-rules"
            maxLength={SCREENING_TEXTAREA_MAX_LENGTH}
            onChange={(event) => setSemanticRules(event.target.value)}
            placeholder="每行一个要求，例如：有 0 到 1 搭建复杂前端项目经验"
            value={joinRuleLines(semanticRules.map((rule) => rule.requirement))}
          />
          <SearchableSelect
            onChange={(value) =>
              patchPolicy({
                rules: policy.rules.map((rule) =>
                  rule.type === "semantic"
                    ? { ...rule, severity: (value ?? "warning") as ResumeScreeningRuleSeverity }
                    : rule,
                ),
              })
            }
            options={[
              { label: "阻断", value: "blocking" },
              { label: "提醒", value: "warning" },
              { label: "信息", value: "info" },
            ]}
            placeholder="提醒"
            value={semanticSeverity}
          />
        </FieldContent>
      </Field>
    </div>
  );
}

// oxlint-disable-next-line complexity -- Dialog hosts tabs, queries, validation, and form submission together.
export function JobDescriptionFormDialog({
  initialDraft,
  open,
  onOpenChange,
  record,
  departments,
  interviewers,
  onSaved,
}: {
  initialDraft?: JobDescriptionFormValues | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: JobDescriptionRecord | null;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
  onSaved: () => void;
}) {
  const slug = useWorkspaceSlug();
  const isEdit = record !== null;
  const codeLocked = Boolean(record?.code);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isGeneratingScreeningPolicy, setIsGeneratingScreeningPolicy] = useState(false);
  const [activeTab, setActiveTab] = useState<JobDescriptionFormTab>("basic");
  const resolvedInitialValues = useMemo(() => {
    if (record) {
      return toDepartmentScopedFormValues(record, interviewers);
    }
    if (initialDraft) {
      return initialDraft;
    }
    return emptyJobDescriptionFormValues();
  }, [initialDraft, interviewers, record]);

  const { data: linkedForms = [], isLoading: isFormsLoading } = useQuery({
    enabled: open && isEdit && !!record?.id,
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio.forms.$get({
        param: { slug },
        query: {
          jobDescriptionId: record?.id ?? "",
          page: "1",
          pageSize: "100",
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      const payload = (await response.json()) as {
        records?: CandidateFormTemplateListRecord[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.records) {
        throw new Error(payload?.error ?? "加载关联面试表单失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-forms", slug, record?.id],
  });

  const { data: linkedInterviewQuestions = [], isLoading: isInterviewQuestionsLoading } = useQuery({
    enabled: open && isEdit && !!record?.id,
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["interview-questions"].$get({
        param: { slug },
        query: {
          jobDescriptionId: record?.id ?? "",
          page: "1",
          pageSize: "100",
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      const payload = (await response.json()) as {
        records?: InterviewQuestionTemplateListRecord[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.records) {
        throw new Error(payload?.error ?? "加载关联面试题失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-interview-questions", slug, record?.id],
  });

  const form = useForm({
    defaultValues: resolvedInitialValues,
    onSubmit: async ({ value }) => {
      const body = {
        allowCrossDepartmentInterviewers: value.allowCrossDepartmentInterviewers,
        code: value.code?.trim() || undefined,
        departmentId: value.departmentId,
        description: value.description?.trim() || "",
        interviewerIds: value.interviewerIds,
        name: value.name.trim(),
        prompt: value.prompt.trim(),
        resumeScreeningPolicy: value.resumeScreeningPolicy,
      };

      const response = isEdit
        ? await rpc.api.w[":slug"].studio["job-descriptions"][":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio["job-descriptions"].$post({
            json: body,
            param: { slug },
          });
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<JobDescriptionRecord>)
        | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "在招岗位已更新" : "在招岗位已创建");
      onSaved();
      onOpenChange(false);
    },
    onSubmitInvalid: ({ formApi }) => {
      const meta = formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>;
      const basicFields = [
        "code",
        "name",
        "departmentId",
        "allowCrossDepartmentInterviewers",
        "interviewerIds",
        "description",
        "prompt",
      ];
      const screeningFields = ["resumeScreeningPolicy"];
      const hasBasicError = basicFields.some((key) => (meta[key]?.errors?.length ?? 0) > 0);
      const hasScreeningError = screeningFields.some((key) => (meta[key]?.errors?.length ?? 0) > 0);
      if (hasBasicError) {
        setActiveTab("basic");
      } else if (hasScreeningError) {
        setActiveTab("screening");
      }
    },
    validators: { onSubmit: jobDescriptionFormSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const allowCrossDepartmentInterviewers = useStore(
    form.store,
    (state) => state.values.allowCrossDepartmentInterviewers,
  );
  const selectedDepartmentId = useStore(form.store, (state) => state.values.departmentId);
  const selectedInterviewerIds = useStore(form.store, (state) => state.values.interviewerIds);
  const interviewerOptions = useMemo(
    () =>
      buildJobDescriptionInterviewerOptions(
        interviewers,
        selectedDepartmentId,
        allowCrossDepartmentInterviewers,
      ),
    [allowCrossDepartmentInterviewers, interviewers, selectedDepartmentId],
  );

  useEffect(() => {
    if (open) {
      form.reset(resolvedInitialValues);
      setActiveTab("basic");
    }
  }, [open, form, resolvedInitialValues]);

  const missingRefs = departments.length === 0 || interviewers.length === 0;

  async function handleGenerateCode() {
    setIsGeneratingCode(true);
    try {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"]["generate-code"].$post({
        param: { slug },
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.code) {
        toast.error(payload?.error ?? "生成岗位编码失败");
        return;
      }
      form.setFieldValue("code", payload.code);
    } finally {
      setIsGeneratingCode(false);
    }
  }

  async function handleGenerateScreeningPolicy() {
    const { values } = form.store.state;
    if (!values.prompt.trim()) {
      toast.error("请先填写岗位 Prompt");
      return;
    }
    setIsGeneratingScreeningPolicy(true);
    try {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"][
        "generate-screening-policy"
      ].$post({
        json: {
          description: values.description?.trim() || undefined,
          name: values.name.trim() || undefined,
          prompt: values.prompt.trim(),
        },
        param: { slug },
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        policy?: ResumeScreeningPolicy;
      } | null;
      if (!response.ok || !payload?.policy) {
        toast.error(payload?.error ?? "筛选规则生成失败");
        return;
      }
      form.setFieldValue("resumeScreeningPolicy", payload.policy);
      toast.success(
        payload.policy.rules.length > 0 ? "已生成筛选规则草稿" : "JD 中未发现明确筛选规则",
      );
    } finally {
      setIsGeneratingScreeningPolicy(false);
    }
  }

  return (
    <Tabs onValueChange={(value) => setActiveTab(value as JobDescriptionFormTab)} value={activeTab}>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? "编辑在招岗位" : "新建在招岗位"}
        description="为在招岗位指定部门和面试官，prompt 在面试时会传给语音 agent。"
        size="xl"
        headerExtra={
          <TabsList className="mt-2">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="screening">筛选规则</TabsTrigger>
            {isEdit ? <TabsTrigger value="interview-questions">面试题</TabsTrigger> : null}
            {isEdit ? <TabsTrigger value="forms">面试表单</TabsTrigger> : null}
          </TabsList>
        }
        footer={
          <>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button
              disabled={isSubmitting || missingRefs}
              form="job-description-form"
              type="submit"
            >
              {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </>
        }
      >
        <form
          id="job-description-form"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <AnimatedHeight>
            <TabsContent value="basic">
              <FieldGroup className="mt-4 gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="name">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>
                            岗位名称 <span className="text-destructive">*</span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <Input
                              aria-invalid={!!errors?.length}
                              id={field.name}
                              maxLength={NAME_MAX_LENGTH}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="如：高级前端工程师"
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="code">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      const canGenerateCode = !codeLocked && !isGeneratingCode;
                      let codeButtonLabel = "生成";
                      if (codeLocked) {
                        codeButtonLabel = "已生成";
                      } else if (isGeneratingCode) {
                        codeButtonLabel = "生成中";
                      }
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>岗位编码</FieldLabel>
                          <FieldContent className="gap-2">
                            <InputGroup>
                              <InputGroupInput
                                aria-invalid={!!errors?.length}
                                className={
                                  field.state.value ? "font-mono" : "text-muted-foreground"
                                }
                                id={field.name}
                                placeholder="保存时自动生成"
                                readOnly
                                value={field.state.value ?? ""}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  disabled={!canGenerateCode}
                                  onClick={handleGenerateCode}
                                  type="button"
                                >
                                  {codeButtonLabel}
                                </InputGroupButton>
                              </InputGroupAddon>
                            </InputGroup>
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
                              id={field.name}
                              invalid={!!errors?.length}
                              onChange={(value) => {
                                const nextDepartmentId = normalizeDepartmentId(value);
                                field.handleChange(nextDepartmentId);
                                form.setFieldValue(
                                  "interviewerIds",
                                  filterInterviewerIdsByDepartment(
                                    interviewers,
                                    nextDepartmentId,
                                    selectedInterviewerIds,
                                    allowCrossDepartmentInterviewers,
                                  ),
                                );
                              }}
                              options={departments.map((dept) => ({
                                label: dept.name,
                                value: dept.id,
                              }))}
                              placeholder="选择部门"
                              searchPlaceholder="搜索部门…"
                              value={field.state.value || null}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="allowCrossDepartmentInterviewers">
                    {(field) => (
                      <Field className="md:col-span-2">
                        <Card className="gap-0 rounded-lg py-0">
                          <CardContent className="flex items-center justify-between gap-4 px-3 py-2.5">
                            <div className="space-y-0.5">
                              <FieldLabel htmlFor={field.name}>允许匹配跨部门面试官</FieldLabel>
                              <p className="text-muted-foreground text-xs">
                                关闭时只能选择所属部门下的面试官；开启后可选择任意部门的面试官。
                              </p>
                            </div>
                            <Switch
                              checked={field.state.value}
                              id={field.name}
                              onCheckedChange={(checked) => {
                                field.handleChange(checked);
                                if (!checked) {
                                  form.setFieldValue(
                                    "interviewerIds",
                                    filterInterviewerIdsByDepartment(
                                      interviewers,
                                      selectedDepartmentId,
                                      selectedInterviewerIds,
                                      false,
                                    ),
                                  );
                                }
                              }}
                            />
                          </CardContent>
                        </Card>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="interviewerIds">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field
                          className="md:col-span-2"
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                        >
                          <FieldLabel>
                            面试官 <span className="text-destructive">*</span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <SearchableMultiSelect
                              emptyMessage="没有匹配的面试官"
                              invalid={!!errors?.length}
                              onChange={(next) => {
                                const synced = getDepartmentSyncedInterviewerSelection({
                                  allowCrossDepartmentInterviewers,
                                  currentDepartmentId: selectedDepartmentId,
                                  interviewers,
                                  nextInterviewerIds: next,
                                  previousInterviewerIds: field.state.value,
                                });
                                if (synced.departmentId !== selectedDepartmentId) {
                                  form.setFieldValue("departmentId", synced.departmentId);
                                }
                                field.handleChange(synced.interviewerIds);
                              }}
                              options={interviewerOptions}
                              placeholder="选择面试官…"
                              searchPlaceholder="搜索面试官…"
                              selectedFormat={(count) => `已选 ${count} 位面试官`}
                              selectedPreviewLimit={3}
                              value={field.state.value}
                            />
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
                        <FieldLabel htmlFor={field.name}>描述</FieldLabel>
                        <FieldContent className="gap-2">
                          <div className="relative">
                            <Textarea
                              aria-invalid={!!errors?.length}
                              className="min-h-20 pb-6"
                              id={field.name}
                              maxLength={DESCRIPTION_MAX_LENGTH}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="简要描述岗位职责、要求等"
                              value={field.state.value ?? ""}
                            />
                            <TextareaCounter
                              maxLength={DESCRIPTION_MAX_LENGTH}
                              value={field.state.value}
                            />
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
                          岗位 Prompt <span className="text-destructive">*</span>
                        </FieldLabel>
                        <FieldContent className="gap-2">
                          <MarkdownEditor
                            aria-invalid={!!errors?.length}
                            id={field.name}
                            maxLength={PROMPT_MAX_LENGTH}
                            onBlur={field.handleBlur}
                            onChange={field.handleChange}
                            placeholder="岗位关键职责、技术栈要求、期望的考察维度……"
                            value={field.state.value}
                          />
                          <FieldError errors={errors} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                </form.Field>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="screening">
              <form.Field name="resumeScreeningPolicy">
                {(field) => (
                  <ResumeScreeningPolicyFields
                    isGenerating={isGeneratingScreeningPolicy}
                    onGenerateFromJobDescription={handleGenerateScreeningPolicy}
                    onChange={field.handleChange}
                    policy={field.state.value}
                  />
                )}
              </form.Field>
            </TabsContent>
            {isEdit ? (
              <TabsContent value="interview-questions">
                {/* oxlint-disable-next-line no-use-before-define */}
                <LinkedInterviewQuestionTemplatesList
                  isLoading={isInterviewQuestionsLoading}
                  jobDescriptionId={record?.id ?? ""}
                  templates={linkedInterviewQuestions}
                />
              </TabsContent>
            ) : null}
            {isEdit ? (
              <TabsContent value="forms">
                {/* oxlint-disable-next-line no-use-before-define */}
                <LinkedFormsList
                  isLoading={isFormsLoading}
                  jobDescriptionId={record?.id ?? ""}
                  templates={linkedForms}
                />
              </TabsContent>
            ) : null}
          </AnimatedHeight>
        </form>
      </Modal>
    </Tabs>
  );
}

function LinkedFormsList({
  isLoading,
  jobDescriptionId,
  templates,
}: {
  isLoading: boolean;
  jobDescriptionId: string;
  templates: CandidateFormTemplateListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const newTemplateHref = `/w/${slug}/studio/forms?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">岗位关联的面试表单</p>
          <p className="mt-1 text-muted-foreground text-xs">
            候选人进入面试前需要填写下列表单；全局面试表单在「面试表单」菜单中维护。
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <a href={newTemplateHref} target="_blank" rel="noreferrer">
              <IconExternalLink className="size-3.5" />
              管理表单
            </a>
          }
          size="sm"
          variant="outline"
        />
      </div>

      {isLoading ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            正在加载关联表单…
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            暂无该岗位专属的面试表单。
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card className="gap-0 rounded-xl py-0" key={template.id}>
              <CardContent className="p-0">
                <a
                  className="flex items-start justify-between gap-3 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  href={`/w/${slug}/studio/forms?templateId=${template.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <IconClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{template.title}</p>
                      {template.description ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                          {template.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground text-xs">
                        {template.questionCount} 题 · {template.submissionCount} 份答复
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">岗位专属</Badge>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinkedInterviewQuestionTemplatesList({
  isLoading,
  jobDescriptionId,
  templates,
}: {
  isLoading: boolean;
  jobDescriptionId: string;
  templates: InterviewQuestionTemplateListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const newTemplateHref = `/w/${slug}/studio/interview-questions?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">岗位关联的面试题</p>
          <p className="mt-1 text-muted-foreground text-xs">
            面试创建时会自动绑定到下列面试题的最新版本；全局面试题在「面试题」菜单中维护。
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <a href={newTemplateHref} target="_blank" rel="noreferrer">
              <IconExternalLink className="size-3.5" />
              管理模版
            </a>
          }
          size="sm"
          variant="outline"
        />
      </div>

      {isLoading ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            正在加载关联模版…
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            暂无该岗位专属的面试题。
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card className="gap-0 rounded-xl py-0" key={template.id}>
              <CardContent className="p-0">
                <a
                  className="flex items-start justify-between gap-3 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  href={`/w/${slug}/studio/interview-questions?templateId=${template.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <IconListCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{template.title}</p>
                      {template.description ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                          {template.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground text-xs">
                        {template.questionCount} 题 · {template.bindingCount} 个面试已绑定
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">岗位专属</Badge>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
