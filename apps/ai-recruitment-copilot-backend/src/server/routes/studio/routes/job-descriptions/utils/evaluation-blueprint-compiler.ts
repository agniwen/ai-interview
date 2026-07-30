import type { JobEvaluationBlueprint } from "@arc/db-schema/job-description-evaluation";
import {
  JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS,
  JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY,
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
} from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { z } from "zod";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import {
  generateStructuredWithMastraAgent,
  jobEvaluationBlueprintAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

interface SourceCandidate {
  sourceText: string;
}

interface BlueprintSkillCandidate extends SourceCandidate {
  normalizedSkill: string;
}

interface BlueprintExpectationCandidate extends SourceCandidate {
  expectation: string;
}

export interface BlueprintCompilerCandidate {
  auxiliarySkills: BlueprintSkillCandidate[];
  coreSkills: BlueprintSkillCandidate[];
  dimensionExpectations: Record<
    | "educationBackground"
    | "experienceRelevance"
    | "potential"
    | "projectMatch"
    | "skillMatch"
    | "stability",
    BlueprintExpectationCandidate[]
  >;
  educationExpectation: {
    degreeLevel: "associate" | "bachelor" | "doctorate" | "master" | null;
    majorExpectation: string | null;
    sourceText: string;
  } | null;
  hardGateAtoms: (SourceCandidate & {
    category:
      | "education"
      | "language_ability"
      | "other"
      | "required_certificates"
      | "required_skills"
      | "work_experience"
      | "work_location";
    normalizedRequirement: string;
  })[];
  requiredRelevantExperiences: {
    relevanceScope: "capability" | "domain" | "industry" | "role" | "total_employment";
    scopeDescription: string;
    sourceText: string;
    years: number;
  }[];
}

const sourceCandidateSchema = z.object({ sourceText: z.string().trim().min(1) });
const skillCandidateSchema = sourceCandidateSchema.extend({
  normalizedSkill: z.string().trim().min(1),
});
const expectationCandidateSchema = sourceCandidateSchema.extend({
  expectation: z.string().trim().min(1),
});

export const blueprintCompilerCandidateSchema = z.object({
  auxiliarySkills: z.array(skillCandidateSchema),
  coreSkills: z.array(skillCandidateSchema),
  dimensionExpectations: z.object({
    educationBackground: z.array(expectationCandidateSchema),
    experienceRelevance: z.array(expectationCandidateSchema),
    potential: z.array(expectationCandidateSchema),
    projectMatch: z.array(expectationCandidateSchema),
    skillMatch: z.array(expectationCandidateSchema),
    stability: z.array(expectationCandidateSchema),
  }),
  educationExpectation: sourceCandidateSchema
    .extend({
      degreeLevel: z.enum(["associate", "bachelor", "doctorate", "master"]).nullable(),
      majorExpectation: z.string().trim().min(1).nullable(),
    })
    .nullable(),
  hardGateAtoms: z.array(
    sourceCandidateSchema.extend({
      category: z.enum([
        "education",
        "language_ability",
        "other",
        "required_certificates",
        "required_skills",
        "work_experience",
        "work_location",
      ]),
      normalizedRequirement: z.string().trim().min(1),
    }),
  ),
  requiredRelevantExperiences: z.array(
    sourceCandidateSchema.extend({
      relevanceScope: z.enum(["capability", "domain", "industry", "role", "total_employment"]),
      scopeDescription: z.string().trim().min(1),
      years: z.number().nonnegative(),
    }),
  ),
});

export interface CompileEvaluationBlueprintInput {
  description: string | null;
  modelOutput: BlueprintCompilerCandidate;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
}

interface CompilerMetadata {
  generatedAt: string;
  modelId: string;
  promptVersion: string;
}

const HARD_GATE_SOURCE_KEYS = {
  education: "education",
  language_ability: "languageAbility",
  other: "other",
  required_certificates: "requiredCertificates",
  required_skills: "requiredSkills",
  work_experience: "workExperience",
  work_location: "workLocation",
} as const;

export class BlueprintCompilationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BlueprintCompilationError";
  }
}

function normalizeSource(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLocaleLowerCase();
}

function sourceContains(source: string | null | undefined, quote: string): boolean {
  if (!source) {
    return false;
  }
  return normalizeSource(source).includes(normalizeSource(quote));
}

function hardGateSource(
  config: JobDescriptionStructuredConfig,
  category: keyof typeof HARD_GATE_SOURCE_KEYS,
): string {
  return config.hardGates[HARD_GATE_SOURCE_KEYS[category]];
}

function stableRequirementId(category: string, normalizedRequirement: string): string {
  return `gate_${computeJobEvaluationPayloadHash({
    category,
    normalizedRequirement: normalizeSource(normalizedRequirement),
  }).slice(0, 20)}`;
}

function sourceRefFor(
  input: CompileEvaluationBlueprintInput,
  sourceText: string,
  category?: keyof typeof HARD_GATE_SOURCE_KEYS,
) {
  if (category && sourceContains(hardGateSource(input.structuredConfig, category), sourceText)) {
    return {
      kind: "hard_gate" as const,
      path: `hardGates.${HARD_GATE_SOURCE_KEYS[category]}`,
    };
  }
  if (sourceContains(input.description, sourceText)) {
    return { kind: "job_description" as const, path: "description" };
  }
  throw new BlueprintCompilationError(
    "JOB_BLUEPRINT_INVENTED_EXPECTATION",
    `蓝图内容没有岗位来源：${sourceText}`,
  );
}

function mapSkillCandidates(
  input: CompileEvaluationBlueprintInput,
  candidates: BlueprintSkillCandidate[],
  allowHardGate: boolean,
) {
  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = normalizeSource(candidate.normalizedSkill);
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()].flatMap((candidate) => {
    let sourceRef;
    try {
      sourceRef = sourceRefFor(
        input,
        candidate.sourceText,
        allowHardGate ? "required_skills" : undefined,
      );
    } catch (error) {
      if (sourceContains(input.prompt, candidate.sourceText)) {
        return [];
      }
      throw error;
    }
    if (!allowHardGate && sourceRef.kind !== "job_description") {
      return [];
    }
    return [
      {
        normalizedSkill: candidate.normalizedSkill.trim(),
        sourceRef,
        sourceText: candidate.sourceText.trim(),
      },
    ];
  });
}

function resolveRequiredRelevantExperience(input: CompileEvaluationBlueprintInput) {
  const candidates = input.modelOutput.requiredRelevantExperiences.map((candidate) => ({
    ...candidate,
    sourceRef: sourceRefFor(input, candidate.sourceText, "work_experience"),
  }));
  const distinct = new Set(
    candidates.map((candidate) =>
      JSON.stringify({
        relevanceScope: candidate.relevanceScope,
        scopeDescription: normalizeSource(candidate.scopeDescription),
        years: candidate.years,
      }),
    ),
  );
  if (distinct.size > 1) {
    throw new BlueprintCompilationError(
      "JOB_BLUEPRINT_EXPERIENCE_CONFLICT",
      "岗位包含不兼容的经验年限或范围要求，请简化后重试。",
    );
  }
  return candidates[0] ?? null;
}

export function compileEvaluationBlueprint(
  input: CompileEvaluationBlueprintInput,
  metadata: CompilerMetadata,
): JobEvaluationBlueprint {
  const counts = new Map<string, number>();
  for (const atom of input.modelOutput.hardGateAtoms) {
    counts.set(atom.category, (counts.get(atom.category) ?? 0) + 1);
  }
  if (input.modelOutput.hardGateAtoms.length > JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS) {
    throw new BlueprintCompilationError(
      "JOB_BLUEPRINT_REQUIREMENT_LIMIT",
      `硬性门槛总数不能超过 ${JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS} 项`,
    );
  }
  for (const count of counts.values()) {
    if (count > JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY) {
      throw new BlueprintCompilationError(
        "JOB_BLUEPRINT_REQUIREMENT_LIMIT",
        `单个硬性门槛分类不能超过 ${JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY} 项`,
      );
    }
  }

  const coreSkills = mapSkillCandidates(input, input.modelOutput.coreSkills, true);
  const coreKeys = new Set(coreSkills.map((skill) => normalizeSource(skill.normalizedSkill)));
  const auxiliarySkills = mapSkillCandidates(
    input,
    input.modelOutput.auxiliarySkills,
    false,
  ).filter((skill) => !coreKeys.has(normalizeSource(skill.normalizedSkill)));

  const dimensionExpectations = Object.fromEntries(
    Object.entries(input.modelOutput.dimensionExpectations).map(([dimension, expectations]) => [
      dimension,
      expectations.map((expectation) => ({
        expectation: expectation.expectation.trim(),
        sourceRef: sourceRefFor(input, expectation.sourceText),
        sourceText: expectation.sourceText.trim(),
      })),
    ]),
  ) as JobEvaluationBlueprint["dimensionExpectations"];

  const blueprint = {
    auxiliarySkills,
    compiler: metadata,
    coreSkills,
    dimensionExpectations,
    educationExpectation: input.modelOutput.educationExpectation
      ? {
          ...input.modelOutput.educationExpectation,
          sourceRef: sourceRefFor(
            input,
            input.modelOutput.educationExpectation.sourceText,
            "education",
          ),
        }
      : null,
    exclusionConditions: input.structuredConfig.exclusionConditions.map((condition) => ({
      ...condition,
      sourceText: condition.condition,
    })),
    hardGateRequirements: input.modelOutput.hardGateAtoms.map((atom) => ({
      ...atom,
      requirementId: stableRequirementId(atom.category, atom.normalizedRequirement),
      sourceRef: sourceRefFor(input, atom.sourceText, atom.category),
    })),
    priorityConditions: input.structuredConfig.priorityConditions.map((condition) => ({
      ...condition,
      sourceText: condition.condition,
    })),
    requiredRelevantExperience: resolveRequiredRelevantExperience(input),
    schemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  };
  return jobEvaluationBlueprintSchema.parse(blueprint);
}

export const JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION = "structured-job-blueprint-v1";

export function generateEvaluationBlueprintCandidate(input: {
  description: string | null;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
}): Promise<BlueprintCompilerCandidate> {
  return generateStructuredWithMastraAgent({
    agent: jobEvaluationBlueprintAgent,
    maxOutputTokens: 6000,
    prompt: [
      "请把岗位信息编译为结构化简历评估蓝图候选。",
      "只能复述输入中存在的要求，每项 sourceText 必须是输入原文的连续片段。",
      "硬性门槛按原子要求拆分；空分类不生成。",
      "核心技能只来自 requiredSkills 和 JD 描述中的强制措辞。",
      "辅助技能只来自 JD 描述中的优先/加分/了解/熟悉等软措辞。",
      "岗位 Prompt 中的技能不得进入 coreSkills 或 auxiliarySkills。",
      "保留全部明确的经验年限要求到 requiredRelevantExperiences；不要自行选择或合并冲突要求。",
      "不要生成 ID、分数或扣分。",
      JSON.stringify(input),
    ].join("\n"),
    retryOnInvalid: true,
    schema: blueprintCompilerCandidateSchema,
    temperature: 0,
  });
}
