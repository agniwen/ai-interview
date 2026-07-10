"use client";

import { IconInfoCircle, IconLoader2, IconSparkles } from "@tabler/icons-react";
import { createDefaultResumeScreeningPolicy } from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues } from "@arc/shared/job-descriptions";
import type {
  ResumeScreeningFieldRule,
  ResumeScreeningPolicy,
  ResumeScreeningRuleSeverity,
  ResumeScreeningSkillRule,
} from "@arc/shared/resume-screening";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SCREENING_TEXTAREA_MAX_LENGTH = 2000;
const MIN_EDUCATION_RULE_ID = "minimum-education";
const MIN_WORK_YEARS_RULE_ID = "minimum-work-years";
const REQUIRED_SKILLS_RULE_ID = "required-skills";
const SCREENING_ACTION_OPTIONS = [
  { label: "暂缓推进", value: "blocking" },
  { label: "需核实", value: "warning" },
  { label: "仅记录", value: "info" },
];
const SCREENING_SECTION_CLASS = "flex flex-col gap-4 rounded-lg border bg-muted/10 p-4";
const SCREENING_SECTION_HEADER_CLASS = "flex flex-col gap-1";
const SCREENING_RULE_ROW_CLASS =
  "grid gap-3 py-3 md:grid-cols-[minmax(12rem,1fr)_minmax(0,1fr)_9rem] md:items-center";
const SCREENING_RULE_GRID_HEADER_CLASS =
  "hidden gap-3 border-b px-1 pb-2 text-muted-foreground text-xs font-medium md:grid md:grid-cols-[minmax(12rem,1fr)_minmax(0,1fr)_9rem] md:items-center";
const SCREENING_ACTION_TOOLTIP =
  "暂缓推进：未满足时建议暂缓；需核实：未满足或证据不确定时提醒 HR 核实；仅记录：只展示信息，不影响通过/暂缓建议。";

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

function ScreeningActionLabel() {
  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel>未满足时</FieldLabel>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label="查看筛选规则处理方式说明"
              className="text-muted-foreground transition-colors hover:text-foreground"
              type="button"
            >
              <IconInfoCircle className="size-3.5" />
            </button>
          }
        />
        <TooltipContent className="max-w-72" side="top">
          {SCREENING_ACTION_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// eslint-disable-next-line complexity -- rule editor coordinates several controlled field groups.
export function ResumeScreeningPolicyFields({
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
  const requiredSkillsPolicyText = joinRuleLines(requiredSkillsRule?.requiredSkills ?? []);
  const semanticPolicyText = joinRuleLines(semanticRules.map((rule) => rule.requirement));
  const [requiredSkillsText, setRequiredSkillsText] = useState(requiredSkillsPolicyText);
  const [semanticRulesText, setSemanticRulesText] = useState(semanticPolicyText);

  useEffect(() => {
    setRequiredSkillsText(requiredSkillsPolicyText);
  }, [requiredSkillsPolicyText]);

  useEffect(() => {
    setSemanticRulesText(semanticPolicyText);
  }, [semanticPolicyText]);

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
    setRequiredSkillsText(value);
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
    setSemanticRulesText(value);
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
    <FieldGroup className="mt-4 gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm">筛选规则草稿</p>
          <p className="text-muted-foreground text-xs">
            先确认基础门槛，再补充技能和经验要求；右侧处理方式决定筛选结果的提示级别。
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
              <IconLoader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <IconSparkles data-icon="inline-start" />
            )}
            从 JD 生成
          </Button>
        ) : null}
      </div>

      <Field orientation="horizontal">
        <Card className="gap-0 rounded-lg py-0 w-full">
          <CardContent className="flex items-center justify-between gap-4 px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
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

      <section className={SCREENING_SECTION_CLASS}>
        <div className={SCREENING_SECTION_HEADER_CLASS}>
          <p className="font-medium text-sm">基础门槛</p>
          <p className="text-muted-foreground text-xs">
            放在最前面，方便 HR 先确认硬性条件，再继续编辑需要判断的内容。
          </p>
        </div>
        <div className="flex flex-col">
          <div className={SCREENING_RULE_GRID_HEADER_CLASS}>
            <span>规则</span>
            <span>要求</span>
            <ScreeningActionLabel />
          </div>

          <div className="divide-y">
            <div className={SCREENING_RULE_ROW_CLASS}>
              <div className="flex flex-col gap-1">
                <FieldLabel>最低学历</FieldLabel>
                <p className="text-muted-foreground text-xs">不限制学历时选择“不限”。</p>
              </div>
              <Field className="gap-1.5">
                <FieldLabel className="md:sr-only">学历要求</FieldLabel>
                <FieldContent>
                  <SearchableSelect
                    id="minimum-education"
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
                </FieldContent>
              </Field>
              <Field className="gap-1.5">
                <div className="md:hidden">
                  <ScreeningActionLabel />
                </div>
                <FieldContent>
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
                    options={SCREENING_ACTION_OPTIONS}
                    placeholder="暂缓推进"
                    value={minimumEducationRule?.severity ?? "blocking"}
                  />
                </FieldContent>
              </Field>
            </div>

            <div className={SCREENING_RULE_ROW_CLASS}>
              <div className="flex flex-col gap-1">
                <FieldLabel>最低工作年限</FieldLabel>
                <p className="text-muted-foreground text-xs">留空表示不设置年限门槛。</p>
              </div>
              <Field className="gap-1.5">
                <FieldLabel className="md:sr-only" htmlFor="minimum-work-years">
                  年限要求
                </FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupInput
                      id="minimum-work-years"
                      min={0}
                      onChange={(event) => setMinimumWorkYears(event.target.value)}
                      placeholder="不限"
                      type="number"
                      value={minimumWorkYearsRule?.years ?? ""}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>年</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </FieldContent>
              </Field>
              <Field className="gap-1.5">
                <div className="md:hidden">
                  <ScreeningActionLabel />
                </div>
                <FieldContent>
                  <SearchableSelect
                    disabled={!minimumWorkYearsRule}
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
                    options={SCREENING_ACTION_OPTIONS}
                    placeholder="暂缓推进"
                    value={minimumWorkYearsRule?.severity ?? "blocking"}
                  />
                </FieldContent>
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className={SCREENING_SECTION_CLASS}>
        <div className={SCREENING_SECTION_HEADER_CLASS}>
          <p className="font-medium text-sm">必备技能</p>
          <p className="text-muted-foreground text-xs">
            逐行填写技能，下面再设置满足条件和未满足时的处理方式。
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="required-skills">技能列表</FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              className="min-h-28"
              id="required-skills"
              maxLength={SCREENING_TEXTAREA_MAX_LENGTH}
              onChange={(event) => setRequiredSkills(event.target.value)}
              placeholder={"React\nTypeScript\nNode.js"}
              value={requiredSkillsText}
            />
            <InputGroupAddon align="block-end">
              <InputGroupText>
                已填写 {requiredSkillsRule?.requiredSkills.length ?? 0} 项
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem_7.5rem]">
          <Field>
            <FieldLabel>满足条件</FieldLabel>
            <SearchableSelect
              disabled={!requiredSkillsRule}
              onChange={(value) => setRequiredSkillsMatchMode(value === "at_least" ? value : "all")}
              options={[
                { label: "全部满足", value: "all" },
                { label: "至少 N 项", value: "at_least" },
              ]}
              placeholder="全部满足"
              value={requiredSkillsRule?.matchMode.type ?? "all"}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="required-skills-match-count">数量</FieldLabel>
            <InputGroup>
              <InputGroupInput
                disabled={requiredSkillsRule?.matchMode.type !== "at_least"}
                id="required-skills-match-count"
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
              <InputGroupAddon align="inline-end">
                <InputGroupText>项</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <ScreeningActionLabel />
            <SearchableSelect
              disabled={!requiredSkillsRule}
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
              options={SCREENING_ACTION_OPTIONS}
              placeholder="需核实"
              value={skillSeverity}
            />
          </Field>
        </div>
      </section>

      <section className={SCREENING_SECTION_CLASS}>
        <div className={SCREENING_SECTION_HEADER_CLASS}>
          <p className="font-medium text-sm">其他语义要求</p>
          <p className="text-muted-foreground text-xs">
            用自然语言写经验、行业背景或复杂项目要求，每行是一条独立规则。
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="semantic-screening-rules">要求列表</FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              className="min-h-32"
              id="semantic-screening-rules"
              maxLength={SCREENING_TEXTAREA_MAX_LENGTH}
              onChange={(event) => setSemanticRules(event.target.value)}
              placeholder={
                "有互联网或餐饮行业招聘经验优先\n独立负责并交付过总监级及以上人员猎聘经验"
              }
              value={semanticRulesText}
            />
            <InputGroupAddon align="block-end">
              <InputGroupText>已填写 {semanticRules.length} 条</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <Field className="max-w-[12rem]">
          <ScreeningActionLabel />
          <SearchableSelect
            disabled={semanticRules.length === 0}
            onChange={(value) =>
              patchPolicy({
                rules: policy.rules.map((rule) =>
                  rule.type === "semantic"
                    ? { ...rule, severity: (value ?? "warning") as ResumeScreeningRuleSeverity }
                    : rule,
                ),
              })
            }
            options={SCREENING_ACTION_OPTIONS}
            placeholder="需核实"
            value={semanticSeverity}
          />
        </Field>
      </section>
    </FieldGroup>
  );
}

// oxlint-disable-next-line complexity -- Dialog hosts tabs, queries, validation, and form submission together.
