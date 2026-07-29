"use client";

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- multi-thumb weight controls follow the ARIA slider pattern. */

import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import type {
  JobDescriptionDimensionWeights,
  JobDescriptionScoringCondition,
  JobDescriptionStructuredConfig,
} from "@arc/db-schema/job-description-structured-config";
import {
  JOB_DESCRIPTION_HARD_GATE_MAX_LENGTH,
  JOB_DESCRIPTION_SCORING_CONDITION_LIMIT,
  JOB_DESCRIPTION_SCORING_CONDITION_MAX_LENGTH,
} from "@arc/db-schema/job-description-structured-config";
import { cn } from "@arc/shared/utils";
import { useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getDimensionWeightBoundaries,
  JOB_DESCRIPTION_DIMENSIONS,
  moveDimensionWeightBoundary,
} from "./job-description-weights";

const HARD_GATE_FIELDS = [
  {
    key: "education",
    label: "学历要求",
    placeholder: "如：本科及以上；985/211 院校；计算机相关专业",
  },
  {
    key: "workExperience",
    label: "经验年限",
    placeholder: "如：3 年以上 B2B SaaS 前端开发经验",
  },
  {
    key: "requiredSkills",
    label: "必备技能",
    placeholder: "如：必须具备 React、TypeScript 和复杂表单开发经验",
  },
  {
    key: "workLocation",
    label: "工作地点",
    placeholder: "如：可接受上海到岗，每周至少到岗 3 天",
  },
  {
    key: "languageAbility",
    label: "语言能力",
    placeholder: "如：英语可作为工作语言，能够独立参与英文会议",
  },
  {
    key: "requiredCertificates",
    label: "必备证书",
    placeholder: "如：必须持有有效注册会计师证书",
  },
  {
    key: "other",
    label: "其他硬性门槛",
    placeholder: "如：可接受夜班；必须持有有效工作许可",
  },
] as const satisfies readonly {
  key: keyof JobDescriptionStructuredConfig["hardGates"];
  label: string;
  placeholder: string;
}[];

function SectionHeader({ description, title }: { description: string; title: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-sm bg-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function HardGateFields({
  hardGates,
  onChange,
}: {
  hardGates: JobDescriptionStructuredConfig["hardGates"];
  onChange: (hardGates: JobDescriptionStructuredConfig["hardGates"]) => void;
}) {
  return (
    <Card className="gap-4 p-4">
      <SectionHeader
        description="每个非空字段会在发布前拆成可确认的原子门槛，并用于新版简历评估。"
        title="硬性门槛"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {HARD_GATE_FIELDS.map((definition) => (
          <div
            className={cn("space-y-2", definition.key === "other" && "md:col-span-2")}
            key={definition.key}
          >
            <FieldLabel htmlFor={`hard-gate-${definition.key}`}>{definition.label}</FieldLabel>
            <Textarea
              className="min-h-20"
              id={`hard-gate-${definition.key}`}
              maxLength={JOB_DESCRIPTION_HARD_GATE_MAX_LENGTH}
              onChange={(event) =>
                onChange({
                  ...hardGates,
                  [definition.key]: event.target.value,
                })
              }
              placeholder={definition.placeholder}
              value={hardGates[definition.key]}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function DimensionWeightBar({
  onChange,
  weights,
}: {
  onChange: (weights: JobDescriptionDimensionWeights) => void;
  weights: JobDescriptionDimensionWeights;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const boundaries = getDimensionWeightBoundaries(weights);

  function moveBoundary(index: number, nextBoundary: number) {
    onChange(moveDimensionWeightBoundary(weights, index, nextBoundary));
  }

  function handlePointerMove(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }
    moveBoundary(index, ((event.clientX - rect.left) / rect.width) * 100);
  }

  return (
    <Card className="gap-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          description="拖动分界点调整相邻维度；拖到 0% 时该维度停用并置灰。"
          title="权重配置"
        />
        <span className="font-medium text-emerald-600 text-xs">总计 100%</span>
      </div>

      <div className="space-y-5">
        <div className="relative py-5" ref={trackRef}>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {JOB_DESCRIPTION_DIMENSIONS.map(({ color, key }) => (
              <span
                aria-hidden="true"
                key={key}
                style={{
                  backgroundColor: weights[key] === 0 ? "transparent" : color,
                  width: `${weights[key]}%`,
                }}
              />
            ))}
          </div>
          {boundaries.map((boundary, index) => {
            const previousBoundary = boundaries[index - 1] ?? 0;
            const nextBoundary = boundaries[index + 1] ?? 100;
            const leftDimension = JOB_DESCRIPTION_DIMENSIONS[index];
            const overlappingBoundaries = boundaries.filter((value) => value === boundary);
            const overlapIndex = boundaries
              .slice(0, index)
              .filter((value) => value === boundary).length;
            const verticalOffset =
              overlappingBoundaries.length > 1
                ? (overlapIndex - (overlappingBoundaries.length - 1) / 2) * 10
                : 0;
            return (
              <button
                aria-label={`${leftDimension?.label ?? "维度"}与下一维度的权重分界点`}
                aria-valuemax={nextBoundary}
                aria-valuemin={previousBoundary}
                aria-valuenow={boundary}
                className="absolute size-4 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-input bg-background shadow-sm outline-none ring-ring/24 hover:ring-4 focus-visible:ring-4"
                key={`${leftDimension?.key ?? index}-boundary`}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                    return;
                  }
                  event.preventDefault();
                  moveBoundary(index, boundary + (event.key === "ArrowRight" ? 1 : -1));
                }}
                onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerMove={(event) => handlePointerMove(index, event)}
                role="slider"
                style={{
                  left: `${boundary}%`,
                  top: `calc(50% + ${verticalOffset}px)`,
                }}
                type="button"
              />
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {JOB_DESCRIPTION_DIMENSIONS.map(({ color, key, label }) => {
            const disabled = weights[key] === 0;
            return (
              <div
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs",
                  disabled && "bg-muted/50 text-muted-foreground",
                )}
                key={key}
              >
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: disabled ? "var(--muted-foreground)" : color }}
                />
                <span>{label}</span>
                <span className="font-semibold tabular-nums">{weights[key]}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function ScoringConditionList({
  accent,
  conditions,
  emptyText,
  onChange,
  sign,
  title,
}: {
  accent: "positive" | "negative";
  conditions: JobDescriptionScoringCondition[];
  emptyText: string;
  onChange: (conditions: JobDescriptionScoringCondition[]) => void;
  sign: "+" | "−";
  title: string;
}) {
  const atLimit = conditions.length >= JOB_DESCRIPTION_SCORING_CONDITION_LIMIT;

  function patchCondition(index: number, patch: Partial<JobDescriptionScoringCondition>) {
    onChange(
      conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3",
        accent === "positive"
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-red-200 bg-red-50/50",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h4
          className={cn(
            "font-medium text-sm",
            accent === "positive" ? "text-emerald-700" : "text-red-700",
          )}
        >
          {title}
        </h4>
        <Button
          disabled={atLimit}
          onClick={() =>
            onChange([
              ...conditions,
              {
                condition: "",
                id: crypto.randomUUID(),
                points: 1,
              },
            ])
          }
          size="xs"
          type="button"
          variant="outline"
        >
          <IconPlus className="size-3.5" />
          添加
        </Button>
      </div>

      {conditions.length === 0 ? (
        <p className="rounded-md border border-dashed bg-background/60 px-3 py-5 text-center text-muted-foreground text-xs">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => {
            const conditionMissing = condition.condition.trim().length === 0;
            return (
              <div className="space-y-1" key={condition.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] gap-2">
                  <Input
                    aria-invalid={conditionMissing || undefined}
                    maxLength={JOB_DESCRIPTION_SCORING_CONDITION_MAX_LENGTH}
                    onChange={(event) => patchCondition(index, { condition: event.target.value })}
                    placeholder="输入条件内容"
                    value={condition.condition}
                  />
                  <label className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 z-20 -translate-y-1/2 font-medium text-muted-foreground text-sm">
                      {sign}
                    </span>
                    <Input
                      aria-label={`${title}分值`}
                      className="pl-6"
                      max={100}
                      min={1}
                      onChange={(event) => {
                        const nextPoints = Number.parseInt(event.target.value, 10);
                        if (Number.isFinite(nextPoints)) {
                          patchCondition(index, {
                            points: Math.max(1, Math.min(100, nextPoints)),
                          });
                        }
                      }}
                      type="number"
                      value={condition.points}
                    />
                  </label>
                  <Button
                    aria-label={`删除${title}`}
                    onClick={() =>
                      onChange(conditions.filter((_, conditionIndex) => conditionIndex !== index))
                    }
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>
                {conditionMissing ? (
                  <p className="text-destructive text-xs">请输入条件内容</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoringConditions({
  config,
  onChange,
}: {
  config: JobDescriptionStructuredConfig;
  onChange: (config: JobDescriptionStructuredConfig) => void;
}) {
  return (
    <Card className="gap-4 p-4">
      <SectionHeader
        description="规则不绑定六维；发布后会按命中结果叠加到综合分。"
        title="优先与排除条件"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ScoringConditionList
          accent="positive"
          conditions={config.priorityConditions}
          emptyText="暂无优先条件"
          onChange={(priorityConditions) => onChange({ ...config, priorityConditions })}
          sign="+"
          title="优先条件"
        />
        <ScoringConditionList
          accent="negative"
          conditions={config.exclusionConditions}
          emptyText="暂无排除条件"
          onChange={(exclusionConditions) => onChange({ ...config, exclusionConditions })}
          sign="−"
          title="排除条件"
        />
      </div>
    </Card>
  );
}

export function JobDescriptionStructuredFields({
  config,
  disabled = false,
  onChange,
}: {
  config: JobDescriptionStructuredConfig;
  disabled?: boolean;
  onChange: (config: JobDescriptionStructuredConfig) => void;
}) {
  return (
    <fieldset className="mt-8 space-y-4 border-t pt-6" disabled={disabled}>
      <div className="space-y-1">
        <h2 className="font-semibold text-base">JD 结构化</h2>
        <p className="text-muted-foreground text-sm">
          配置岗位硬性门槛、评分维度权重以及优先与排除条件。
        </p>
      </div>

      <Alert className="bg-muted/40">
        <IconInfoCircle />
        <AlertDescription>
          发布前请生成并确认评估蓝图；发布后门槛、权重和条件将冻结。
        </AlertDescription>
      </Alert>

      <HardGateFields
        hardGates={config.hardGates}
        onChange={(hardGates) => onChange({ ...config, hardGates })}
      />
      <DimensionWeightBar
        onChange={(weights) => onChange({ ...config, weights })}
        weights={config.weights}
      />
      <ScoringConditions config={config} onChange={onChange} />
    </fieldset>
  );
}
