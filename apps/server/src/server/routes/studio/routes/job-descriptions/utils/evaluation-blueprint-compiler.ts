/* oxlint-disable max-lines -- the versioned compiler keeps source validation, deterministic normalization, and AI prompt assembly in one auditable module. */
import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import {
  JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS,
  JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY,
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
} from "@arc/db-schema/job-description-evaluation";
import type {
  JobDescriptionStructuredConfig,
  StructuredResumeRuleId,
} from "@arc/db-schema/job-description-structured-config";
import { structuredResumeRuleIdSchema } from "@arc/db-schema/job-description-structured-config";
import type { StructuredResumeDimension } from "@arc/shared/structured-resume-scoring";
import { STRUCTURED_RESUME_DIMENSIONS } from "@arc/shared/structured-resume-scoring";
import { z } from "zod";
import { computeJobEvaluationPayloadHash } from "@app/server/lib/server/job-evaluation-hash";
import {
  generateStructuredWithMastraAgent,
  jobEvaluationBlueprintAgent,
} from "@app/server/server/agents/mastra/agents/simple-generators";
import type { MastraGeneratorLike } from "@app/server/server/agents/mastra/agents/simple-generators";

const jobEvaluationBlueprintJsonAgent: MastraGeneratorLike = {
  generate(messages, options) {
    if (options?.abortSignal && options.modelSettings) {
      return jobEvaluationBlueprintAgent.generate(messages, {
        abortSignal: options.abortSignal,
        modelSettings: options.modelSettings,
      });
    }
    if (options?.abortSignal) {
      return jobEvaluationBlueprintAgent.generate(messages, { abortSignal: options.abortSignal });
    }
    if (options?.modelSettings) {
      return jobEvaluationBlueprintAgent.generate(messages, {
        modelSettings: options.modelSettings,
      });
    }
    return jobEvaluationBlueprintAgent.generate(messages, {});
  },
};

interface SourceCandidate {
  sourceText: string;
}

interface BlueprintSkillCandidate extends SourceCandidate {
  normalizedSkill: string;
  requirementGroup: string;
  satisfactionMode: "all" | "any";
}

interface BlueprintExpectationCandidate extends SourceCandidate {
  expectation: string;
}

export interface ScoringBlueprintCandidate {
  auxiliarySkills: BlueprintSkillCandidate[];
  coreSkills: BlueprintSkillCandidate[];
  dimensionExpectations: Record<StructuredResumeDimension, BlueprintExpectationCandidate[]>;
  educationExpectation: {
    degreeLevel: "associate" | "bachelor" | "doctorate" | "master" | null;
    majorExpectation: string | null;
    sourceText: string;
  } | null;
  requiredRelevantExperiences: {
    relevanceScope: "capability" | "domain" | "industry" | "role" | "total_employment";
    scopeDescription: string;
    sourceText: string;
    years: number;
  }[];
}

export interface HardGateCompilerCandidate {
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
}

export interface BlueprintCompilerCandidate
  extends HardGateCompilerCandidate, ScoringBlueprintCandidate {}

const sourceCandidateSchema = z.object({ sourceText: z.string().trim().min(1) });
const skillCandidateSchema = sourceCandidateSchema.extend({
  normalizedSkill: z.string().trim().min(1),
  requirementGroup: z.string().trim().min(1).max(80),
  satisfactionMode: z.enum(["all", "any"]),
});
const expectationCandidateSchema = sourceCandidateSchema.extend({
  expectation: z.string().trim().min(1),
});

export const scoringBlueprintCandidateSchema = z.object({
  auxiliarySkills: z.array(skillCandidateSchema).max(8),
  coreSkills: z.array(skillCandidateSchema).max(8),
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
  requiredRelevantExperiences: z.array(
    sourceCandidateSchema.extend({
      relevanceScope: z.enum(["capability", "domain", "industry", "role", "total_employment"]),
      scopeDescription: z.string().trim().min(1),
      years: z.number().nonnegative(),
    }),
  ),
});

export const hardGateCompilerCandidateSchema = z.object({
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
});

const skillEducationCandidateSchema = scoringBlueprintCandidateSchema.pick({
  auxiliarySkills: true,
  coreSkills: true,
  educationExpectation: true,
});

const experienceProjectPotentialStabilityCandidateSchema = z.object({
  dimensionExpectations: scoringBlueprintCandidateSchema.shape.dimensionExpectations.pick({
    experienceRelevance: true,
    potential: true,
    projectMatch: true,
    stability: true,
  }),
  requiredRelevantExperiences: scoringBlueprintCandidateSchema.shape.requiredRelevantExperiences,
});

export const blueprintCompilerCandidateSchema = scoringBlueprintCandidateSchema.extend(
  hardGateCompilerCandidateSchema.shape,
);

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
const HARD_GATE_CATEGORIES = [
  "education",
  "language_ability",
  "other",
  "required_certificates",
  "required_skills",
  "work_experience",
  "work_location",
] as const satisfies readonly (keyof typeof HARD_GATE_SOURCE_KEYS)[];

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

export function stableSkillRequirementGroupId(
  expectationType: "auxiliary" | "core",
  satisfactionMode: "all" | "any",
  skills: string[],
): string {
  return `skill_group_${computeJobEvaluationPayloadHash({
    expectationType,
    satisfactionMode,
    skills: skills.map(normalizeSource).toSorted(),
  }).slice(0, 20)}`;
}

function sourceContains(source: string | null | undefined, quote: string): boolean {
  if (!source) {
    return false;
  }
  return normalizeSource(source).includes(normalizeSource(quote));
}

const JD_SECTION_HEADING_RE =
  /^(?:#{1,6}\s*)?(岗位定位|岗位职责|任职要求|技能要求|核心技能|辅助技能|经验要求|项目要求|学历要求|潜力与稳定性|优先条件|优先项|加分项)\s*[:：]?\s*(.*)$/u;
const PRIORITY_SECTION_NAMES = new Set(["优先条件", "优先项", "加分项"]);
const MAX_SCORING_SKILLS_PER_TIER = 8;
const NON_SKILL_CONCEPT_RE =
  /经验|经历|从业|需求拆解|拆解需求|项目把控|把控项目|技术难点攻坚|攻坚技术难点|平台增长|项目落地|团队管理|研发管理|跨部门协同|结果导向|业务落地|技术体系建设|人才梯队/u;

interface PartitionedJobSource {
  base: string;
  priority: string;
}

function partitionJobSource(value: string): PartitionedJobSource {
  const base: string[] = [];
  const priority: string[] = [];
  let inPrioritySection = false;
  for (const line of value.split(/\r?\n/u)) {
    const heading = JD_SECTION_HEADING_RE.exec(line.trim());
    if (heading) {
      inPrioritySection = PRIORITY_SECTION_NAMES.has(heading[1] ?? "");
      const inlineContent = heading[2]?.trim();
      if (inlineContent) {
        (inPrioritySection ? priority : base).push(inlineContent);
      }
      continue;
    }
    (inPrioritySection ? priority : base).push(line);
  }
  return { base: base.join("\n"), priority: priority.join("\n") };
}

function sourceAppearsOnlyInPrioritySection(
  input: Pick<CompileEvaluationBlueprintInput, "description" | "prompt">,
  sourceText: string,
): boolean {
  const sections = [input.description ?? "", input.prompt].map(partitionJobSource);
  return (
    sections.some((section) => sourceContains(section.priority, sourceText)) &&
    !sections.some((section) => sourceContains(section.base, sourceText))
  );
}

function baseScoringSource(value: string): string {
  return partitionJobSource(value).base;
}

function isScoringSkillCandidate(
  input: CompileEvaluationBlueprintInput,
  candidate: BlueprintSkillCandidate,
): boolean {
  if (sourceAppearsOnlyInPrioritySection(input, candidate.sourceText)) {
    return false;
  }
  return !NON_SKILL_CONCEPT_RE.test(normalizeSource(candidate.normalizedSkill));
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

function scoringSourceRef(input: CompileEvaluationBlueprintInput, sourceText: string) {
  if (sourceContains(input.description, sourceText)) {
    return { kind: "job_description" as const, path: "description" };
  }
  if (sourceContains(input.prompt, sourceText)) {
    return { kind: "job_description" as const, path: "prompt" };
  }
  throw new BlueprintCompilationError(
    "JOB_BLUEPRINT_INVENTED_EXPECTATION",
    `蓝图内容没有岗位来源：${sourceText}`,
  );
}

function sourceAppearsInHardGates(
  input: CompileEvaluationBlueprintInput,
  sourceText: string,
): boolean {
  return Object.values(input.structuredConfig.hardGates).some((source) =>
    sourceContains(source, sourceText),
  );
}

function hardGateSourceRef(
  input: CompileEvaluationBlueprintInput,
  category: keyof typeof HARD_GATE_SOURCE_KEYS,
  sourceText: string,
) {
  if (!sourceContains(hardGateSource(input.structuredConfig, category), sourceText)) {
    throw new BlueprintCompilationError(
      "JOB_BLUEPRINT_INVENTED_EXPECTATION",
      `硬性门槛内容没有配置来源：${sourceText}`,
    );
  }
  return {
    kind: "hard_gate" as const,
    path: `hardGates.${HARD_GATE_SOURCE_KEYS[category]}`,
  };
}

function mapSkillCandidates(
  input: CompileEvaluationBlueprintInput,
  candidates: BlueprintSkillCandidate[],
) {
  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    if (!isScoringSkillCandidate(input, candidate)) {
      continue;
    }
    const key = normalizeSource(candidate.normalizedSkill);
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()].flatMap((candidate) => {
    let sourceRef;
    try {
      sourceRef = scoringSourceRef(input, candidate.sourceText);
    } catch (error) {
      if (sourceAppearsInHardGates(input, candidate.sourceText)) {
        return [];
      }
      throw error;
    }
    return [
      {
        normalizedSkill: candidate.normalizedSkill.trim(),
        requirementGroup: candidate.requirementGroup,
        satisfactionMode: candidate.satisfactionMode,
        sourceRef,
        sourceText: candidate.sourceText.trim(),
      },
    ];
  });
}

function freezeSkillRequirementGroups(
  expectationType: "auxiliary" | "core",
  skills: ReturnType<typeof mapSkillCandidates>,
) {
  const groups = new Map<string, typeof skills>();
  for (const skill of skills) {
    const group = groups.get(skill.requirementGroup) ?? [];
    if (group.some((item) => item.satisfactionMode !== skill.satisfactionMode)) {
      throw new BlueprintCompilationError(
        "JOB_BLUEPRINT_INVALID_SKILL_GROUP",
        `技能要求组“${skill.requirementGroup}”的满足方式不一致`,
      );
    }
    group.push(skill);
    groups.set(skill.requirementGroup, group);
  }
  return [...groups.values()].flatMap((group) => {
    const satisfactionMode = group[0]?.satisfactionMode;
    if (!satisfactionMode) {
      return [];
    }
    if (satisfactionMode === "any" && group.length < 2) {
      throw new BlueprintCompilationError(
        "JOB_BLUEPRINT_INVALID_SKILL_GROUP",
        `任一满足的技能要求组至少需要两个可替代技能：${group[0]?.normalizedSkill ?? "未知技能"}`,
      );
    }
    const requirementGroupId = stableSkillRequirementGroupId(
      expectationType,
      satisfactionMode,
      group.map((skill) => skill.normalizedSkill),
    );
    return group.map(({ requirementGroup: _requirementGroup, ...skill }) => ({
      ...skill,
      requirementGroupId,
    }));
  });
}

function resolveConfiguredHardGateAtoms(input: CompileEvaluationBlueprintInput) {
  return input.modelOutput.hardGateAtoms.flatMap((atom) => {
    if (sourceContains(hardGateSource(input.structuredConfig, atom.category), atom.sourceText)) {
      return [atom];
    }
    try {
      scoringSourceRef(input, atom.sourceText);
      return [];
    } catch {
      hardGateSourceRef(input, atom.category, atom.sourceText);
      return [];
    }
  });
}

function configuredHardGateClauses(value: string): string[] {
  return value
    .split(/[\n；;。]+/u)
    .map((clause) => clause.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/u, "").trim())
    .filter(Boolean);
}

function assertCompleteHardGateCoverage(
  input: CompileEvaluationBlueprintInput,
  atoms: HardGateCompilerCandidate["hardGateAtoms"],
): void {
  for (const category of HARD_GATE_CATEGORIES) {
    const clauses = configuredHardGateClauses(hardGateSource(input.structuredConfig, category));
    const categoryAtoms = atoms.filter((atom) => atom.category === category);
    const usedAtomIndexes = new Set<number>();
    for (const clause of clauses) {
      const atomIndex = categoryAtoms.findIndex(
        (atom, index) => !usedAtomIndexes.has(index) && sourceContains(clause, atom.sourceText),
      );
      if (atomIndex === -1) {
        throw new BlueprintCompilationError(
          "JOB_BLUEPRINT_INCOMPLETE_HARD_GATE",
          `硬性门槛没有被完整拆分：${clause}`,
        );
      }
      usedAtomIndexes.add(atomIndex);
    }
  }
}

function normalizeRelevantExperienceScope(
  candidate: BlueprintCompilerCandidate["requiredRelevantExperiences"][number],
) {
  if (candidate.relevanceScope !== "total_employment") {
    return candidate;
  }
  const source = normalizeSource(`${candidate.sourceText}${candidate.scopeDescription}`);
  const explicitlyTotal =
    /(?:总|累计)(?:工作|从业)经验|(?:工作|从业)年限|\d+(?:\.\d+)?年(?:以上)?工作经验/u.test(source);
  return explicitlyTotal ? candidate : { ...candidate, relevanceScope: "role" as const };
}

function compileRelevantExperienceCandidates(input: CompileEvaluationBlueprintInput) {
  return input.modelOutput.requiredRelevantExperiences.flatMap((candidate) => {
    if (sourceAppearsOnlyInPrioritySection(input, candidate.sourceText)) {
      return [];
    }
    try {
      return [
        {
          ...normalizeRelevantExperienceScope(candidate),
          sourceRef: scoringSourceRef(input, candidate.sourceText),
        },
      ];
    } catch (error) {
      if (sourceAppearsInHardGates(input, candidate.sourceText)) {
        return [];
      }
      throw error;
    }
  });
}

interface ExperienceThresholdInput {
  description: string | null;
  prompt: string;
  structuredConfig?: JobDescriptionStructuredConfig;
}

function isConfiguredConditionClause(input: ExperienceThresholdInput, clause: string) {
  if (!input.structuredConfig) {
    return false;
  }
  const configuredConditions = [
    ...Object.values(input.structuredConfig.hardGates),
    ...input.structuredConfig.priorityConditions.map((condition) => condition.condition),
    ...input.structuredConfig.exclusionConditions.map((condition) => condition.condition),
  ].filter(Boolean);
  return configuredConditions.some(
    (condition) => sourceContains(condition, clause) || sourceContains(clause, condition),
  );
}

function explicitExperienceThresholds(input: ExperienceThresholdInput) {
  const unique = new Map<string, { clause: string; years: number }>();
  for (const source of [input.description ?? "", input.prompt].map(baseScoringSource)) {
    for (const rawClause of source.split(/[\n；;。，,]+/u)) {
      const clause = rawClause
        .trim()
        .replace(/^\d+[.)、]\s*/u, "")
        .replaceAll(/[（(][^）)]*(?:建议|优先|加分项|最好)[^）)]*(?:[）)]|$)/gu, "")
        .trim();
      if (
        !clause ||
        /^(?:建议|优先|加分项|最好)/u.test(clause) ||
        isConfiguredConditionClause(input, clause) ||
        !/(?:经验|经历|从业|工作年限|任职年限)/u.test(clause)
      ) {
        continue;
      }
      for (const match of clause.matchAll(/(\d+(?:\.\d+)?)\s*年/gu)) {
        const years = Number(match[1]);
        if (!(Number.isFinite(years) && years > 0)) {
          continue;
        }
        const key = `${normalizeSource(clause)}:${years}`;
        if (!unique.has(key)) {
          unique.set(key, { clause, years });
        }
      }
    }
  }
  return [...unique.values()];
}

function assertCompleteExperienceRequirementCoverage(
  input: ExperienceThresholdInput,
  candidates: readonly { sourceText: string; years: number }[],
): void {
  const usedCandidateIndexes = new Set<number>();
  for (const threshold of explicitExperienceThresholds(input)) {
    const candidateIndex = candidates.findIndex(
      (candidate, index) =>
        !usedCandidateIndexes.has(index) &&
        candidate.years === threshold.years &&
        sourceContains(threshold.clause, candidate.sourceText),
    );
    if (candidateIndex === -1) {
      throw new BlueprintCompilationError(
        "JOB_BLUEPRINT_INCOMPLETE_EXPERIENCE_REQUIREMENT",
        `JD 中的明确经验年限没有被完整识别：${threshold.clause}`,
      );
    }
    usedCandidateIndexes.add(candidateIndex);
  }
}

function resolveRequiredRelevantExperiences(
  input: CompileEvaluationBlueprintInput,
  candidates = compileRelevantExperienceCandidates(input),
) {
  const unique = new Map<string, ReturnType<typeof compileRelevantExperienceCandidates>[number]>();
  for (const candidate of candidates) {
    const key = JSON.stringify({
      relevanceScope: candidate.relevanceScope,
      scopeDescription: normalizeSource(candidate.scopeDescription),
      years: candidate.years,
    });
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()];
}

function resolveRequiredRelevantExperience(
  input: CompileEvaluationBlueprintInput,
  candidates = resolveRequiredRelevantExperiences(input),
) {
  return (
    candidates.toSorted((left, right) => {
      if (left.years !== right.years) {
        return right.years - left.years;
      }
      return JSON.stringify({
        relevanceScope: left.relevanceScope,
        scopeDescription: normalizeSource(left.scopeDescription),
        sourceText: normalizeSource(left.sourceText),
      }).localeCompare(
        JSON.stringify({
          relevanceScope: right.relevanceScope,
          scopeDescription: normalizeSource(right.scopeDescription),
          sourceText: normalizeSource(right.sourceText),
        }),
      );
    })[0] ?? null
  );
}

const DIMENSION_EXPECTATION_LIMITS = {
  educationBackground: 0,
  experienceRelevance: 6,
  potential: 6,
  projectMatch: 3,
  skillMatch: 0,
  stability: 6,
} as const;

function normalizeDimensionExpectation(
  dimension: keyof typeof DIMENSION_EXPECTATION_LIMITS,
  expectation: BlueprintExpectationCandidate,
): BlueprintExpectationCandidate | null {
  const combined = normalizeSource(`${expectation.expectation}${expectation.sourceText}`);
  if (
    dimension === "stability" &&
    /驻外|工作地点|办公地点|跨文化沟通|语言能力|资格证书|职业资格/u.test(combined)
  ) {
    return null;
  }
  if (dimension !== "experienceRelevance") {
    return expectation;
  }
  const normalizedExpectation = expectation.expectation
    .replace(
      /[，,]\s*(?:能|可|愿意)?(?:长期)?驻外（(建议[^）]*经验[^）]*年[^）]*)）\s*$/u,
      "（$1）",
    )
    .replace(/[，,；;]\s*(?:能|可|愿意)?(?:长期)?驻外.*$/u, "")
    .trim();
  return { ...expectation, expectation: normalizedExpectation || expectation.expectation };
}

function compileDimensionExpectations(input: CompileEvaluationBlueprintInput) {
  const relevantExperiences = compileRelevantExperienceCandidates(input);
  const primaryExperience = resolveRequiredRelevantExperience(input);
  const compiledExpectations = Object.fromEntries(
    STRUCTURED_RESUME_DIMENSIONS.map((dimension) => {
      const expectations = input.modelOutput.dimensionExpectations[dimension];
      const limit = DIMENSION_EXPECTATION_LIMITS[dimension];
      if (limit === 0) {
        return [dimension, []];
      }
      const supplementalExperienceExpectations =
        dimension === "experienceRelevance"
          ? relevantExperiences
              .filter(
                (candidate) =>
                  (!primaryExperience ||
                    normalizeSource(candidate.sourceText) !==
                      normalizeSource(primaryExperience.sourceText)) &&
                  !expectations.some(
                    (expectation) =>
                      sourceContains(expectation.sourceText, candidate.sourceText) ||
                      sourceContains(expectation.expectation, candidate.sourceText),
                  ),
              )
              .map((candidate) => ({
                expectation: candidate.sourceText,
                sourceText: candidate.sourceText,
              }))
          : [];
      const unique = new Map<
        string,
        JobEvaluationBlueprint["dimensionExpectations"][keyof JobEvaluationBlueprint["dimensionExpectations"]][number]
      >();
      for (const sourceExpectation of [...supplementalExperienceExpectations, ...expectations]) {
        if (sourceAppearsOnlyInPrioritySection(input, sourceExpectation.sourceText)) {
          continue;
        }
        const expectation = normalizeDimensionExpectation(dimension, sourceExpectation);
        if (!expectation) {
          continue;
        }
        let sourceRef;
        try {
          sourceRef = scoringSourceRef(input, expectation.sourceText);
        } catch (error) {
          if (sourceAppearsInHardGates(input, expectation.sourceText)) {
            continue;
          }
          throw error;
        }
        const compiled = {
          expectation: expectation.expectation.trim(),
          sourceRef,
          sourceText: expectation.sourceText.trim(),
        };
        const key = normalizeSource(compiled.expectation);
        if (!unique.has(key)) {
          unique.set(key, compiled);
        }
      }
      return [dimension, [...unique.values()].slice(0, limit)];
    }),
  );
  return jobEvaluationBlueprintSchema.shape.dimensionExpectations.parse(compiledExpectations);
}

function compileEducationExpectation(input: CompileEvaluationBlueprintInput) {
  const expectation = input.modelOutput.educationExpectation;
  if (!expectation || sourceAppearsOnlyInPrioritySection(input, expectation.sourceText)) {
    return null;
  }
  try {
    return {
      ...expectation,
      sourceRef: scoringSourceRef(input, expectation.sourceText),
    };
  } catch (error) {
    if (sourceAppearsInHardGates(input, expectation.sourceText)) {
      return null;
    }
    throw error;
  }
}

export function compileEvaluationBlueprint(
  input: CompileEvaluationBlueprintInput,
  metadata: CompilerMetadata,
): JobEvaluationBlueprint {
  const hardGateAtoms = resolveConfiguredHardGateAtoms(input);
  const counts = new Map<string, number>();
  for (const atom of hardGateAtoms) {
    counts.set(atom.category, (counts.get(atom.category) ?? 0) + 1);
  }
  if (hardGateAtoms.length > JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS) {
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
  assertCompleteHardGateCoverage(input, hardGateAtoms);

  const coreSkills = freezeSkillRequirementGroups(
    "core",
    mapSkillCandidates(input, input.modelOutput.coreSkills).slice(0, MAX_SCORING_SKILLS_PER_TIER),
  );
  const coreKeys = new Set(coreSkills.map((skill) => normalizeSource(skill.normalizedSkill)));
  const auxiliarySkills = freezeSkillRequirementGroups(
    "auxiliary",
    mapSkillCandidates(input, input.modelOutput.auxiliarySkills)
      .filter((skill) => !coreKeys.has(normalizeSource(skill.normalizedSkill)))
      .slice(0, MAX_SCORING_SKILLS_PER_TIER),
  );

  const dimensionExpectations = compileDimensionExpectations(input);
  const compiledExperienceCandidates = compileRelevantExperienceCandidates(input);
  assertCompleteExperienceRequirementCoverage(input, compiledExperienceCandidates);
  const requiredRelevantExperiences = resolveRequiredRelevantExperiences(
    input,
    compiledExperienceCandidates,
  );

  const blueprint = {
    auxiliarySkills,
    compiler: metadata,
    coreSkills,
    dimensionExpectations,
    educationExpectation: compileEducationExpectation(input),
    exclusionConditions: input.structuredConfig.exclusionConditions.map((condition) => ({
      ...condition,
      sourceText: condition.condition,
    })),
    hardGateRequirements: hardGateAtoms.map((atom) => ({
      ...atom,
      requirementId: stableRequirementId(atom.category, atom.normalizedRequirement),
      sourceRef: hardGateSourceRef(input, atom.category, atom.sourceText),
    })),
    priorityConditions: input.structuredConfig.priorityConditions.map((condition) => ({
      ...condition,
      sourceText: condition.condition,
    })),
    requiredRelevantExperience: resolveRequiredRelevantExperience(
      input,
      requiredRelevantExperiences,
    ),
    requiredRelevantExperiences: requiredRelevantExperiences.map((requirement) => ({
      ...requirement,
      requirementId: `experience_${computeJobEvaluationPayloadHash({
        relevanceScope: requirement.relevanceScope,
        scopeDescription: normalizeSource(requirement.scopeDescription),
        years: requirement.years,
      }).slice(0, 20)}`,
    })),
    schemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  };
  return jobEvaluationBlueprintSchema.parse(blueprint);
}

export const JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION = "structured-job-blueprint-v11";

interface EvaluationBlueprintGenerationJob {
  description: string | null;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
}

export interface ScoringBlueprintGenerationInput {
  description: string | null;
  prompt: string;
  scoringItems: {
    dimensions: StructuredResumeDimension[];
    enabledRuleIds: StructuredResumeRuleId[];
  };
}

export function buildScoringBlueprintGenerationInput(
  input: EvaluationBlueprintGenerationJob,
): ScoringBlueprintGenerationInput {
  return {
    description: input.description,
    prompt: input.prompt,
    scoringItems: {
      dimensions: [...STRUCTURED_RESUME_DIMENSIONS],
      enabledRuleIds: structuredResumeRuleIdSchema.options.filter(
        (ruleId) => input.structuredConfig.deductionRules[ruleId].enabled,
      ),
    },
  };
}

const scoringCandidateJsonSchema = z.json();
type ScoringCandidateJson = z.infer<typeof scoringCandidateJsonSchema>;

function validateScoringCandidateSources(
  value: ScoringCandidateJson,
  input: ScoringBlueprintGenerationInput,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      validateScoringCandidateSources(item, input);
    }
    return;
  }
  const parsedRecord = z.record(z.string(), z.json()).safeParse(value);
  if (!parsedRecord.success) {
    return;
  }
  for (const [key, item] of Object.entries(parsedRecord.data)) {
    const parsedSourceText = z.string().safeParse(item);
    if (
      key === "sourceText" &&
      parsedSourceText.success &&
      !sourceContains(input.description, parsedSourceText.data) &&
      !sourceContains(input.prompt, parsedSourceText.data)
    ) {
      throw new Error(
        `sourceText 必须逐字引用 JD 的连续原文，当前无来源：${parsedSourceText.data}`,
      );
    }
    validateScoringCandidateSources(item, input);
  }
}

function validateRemainingDimensionsCandidate(
  value: z.infer<typeof experienceProjectPotentialStabilityCandidateSchema>,
  input: ScoringBlueprintGenerationInput,
): void {
  validateScoringCandidateSources(value, input);
  assertCompleteExperienceRequirementCoverage(input, value.requiredRelevantExperiences);
  if (value.dimensionExpectations.projectMatch.length > 3) {
    throw new Error("projectMatch 最多返回 3 项岗位级项目标准。");
  }
  for (const project of value.dimensionExpectations.projectMatch) {
    const normalizedExpectation = normalizeSource(project.expectation);
    const normalizedSourceText = normalizeSource(project.sourceText);
    if (
      normalizedExpectation.length > 80 ||
      (normalizedSourceText.length > 40 && normalizedExpectation === normalizedSourceText)
    ) {
      throw new Error(
        `projectMatch.expectation 必须提炼为简短的岗位级项目标准，不能复制岗位职责：${project.expectation}`,
      );
    }
  }
}

type SkillEducationCandidate = z.infer<typeof skillEducationCandidateSchema>;
type RemainingDimensionsCandidate = z.infer<
  typeof experienceProjectPotentialStabilityCandidateSchema
>;

export type JobEvaluationRuleDraftProgress = (
  ruleDraft: JobEvaluationRuleDraft,
) => Promise<void> | void;

function validateGeneratedSkillRequirementGroups(value: SkillEducationCandidate): void {
  for (const skills of [value.coreSkills, value.auxiliarySkills]) {
    const groups = new Map<string, typeof skills>();
    for (const skill of skills) {
      const group = groups.get(skill.requirementGroup) ?? [];
      group.push(skill);
      groups.set(skill.requirementGroup, group);
    }
    for (const [groupName, group] of groups) {
      const modes = new Set(group.map((skill) => skill.satisfactionMode));
      if (modes.size !== 1) {
        throw new Error(`技能要求组“${groupName}”的 satisfactionMode 必须一致。`);
      }
      if (group[0]?.satisfactionMode === "any" && group.length < 2) {
        throw new Error(`任一满足的技能要求组“${groupName}”至少需要两个可替代技能。`);
      }
    }
  }
}

function buildProgressSkillRequirementGroups(
  skillEducation: SkillEducationCandidate | null,
): JobEvaluationRuleDraft["skillRequirementGroups"] {
  const groups = new Map<string, JobEvaluationRuleDraft["skillRequirementGroups"][number]>();
  for (const [expectationType, skills] of [
    ["core", skillEducation?.coreSkills ?? []],
    ["auxiliary", skillEducation?.auxiliarySkills ?? []],
  ] as const) {
    for (const skill of skills) {
      const key = `${expectationType}:${skill.requirementGroup}`;
      const group = groups.get(key) ?? {
        expectationType,
        satisfactionMode: skill.satisfactionMode,
        skills: [],
      };
      group.skills.push(skill.normalizedSkill);
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

function toProgressRuleDraft(
  skillEducation: SkillEducationCandidate | null,
  remainingDimensions: RemainingDimensionsCandidate | null,
): JobEvaluationRuleDraft {
  const primaryExperience = remainingDimensions?.requiredRelevantExperiences.toSorted(
    (left, right) => right.years - left.years,
  )[0];
  return {
    auxiliarySkills: skillEducation?.auxiliarySkills.map((skill) => skill.normalizedSkill) ?? [],
    coreSkills: skillEducation?.coreSkills.map((skill) => skill.normalizedSkill) ?? [],
    dimensionExpectations: {
      educationBackground: [],
      experienceRelevance:
        remainingDimensions?.dimensionExpectations.experienceRelevance.map(
          (expectation) => expectation.expectation,
        ) ?? [],
      potential:
        remainingDimensions?.dimensionExpectations.potential.map(
          (expectation) => expectation.expectation,
        ) ?? [],
      projectMatch:
        remainingDimensions?.dimensionExpectations.projectMatch.map(
          (expectation) => expectation.expectation,
        ) ?? [],
      skillMatch: [],
      stability:
        remainingDimensions?.dimensionExpectations.stability.map(
          (expectation) => expectation.expectation,
        ) ?? [],
    },
    educationExpectation: skillEducation?.educationExpectation
      ? {
          degreeLevel: skillEducation.educationExpectation.degreeLevel,
          majorExpectation: skillEducation.educationExpectation.majorExpectation,
        }
      : null,
    requiredRelevantExperience: primaryExperience
      ? {
          relevanceScope: primaryExperience.relevanceScope,
          scopeDescription: primaryExperience.scopeDescription,
          years: primaryExperience.years,
        }
      : null,
    skillRequirementGroups: buildProgressSkillRequirementGroups(skillEducation),
  };
}

async function generateScoringBlueprintCandidate(
  input: ScoringBlueprintGenerationInput,
  agent: MastraGeneratorLike,
  onProgress?: JobEvaluationRuleDraftProgress,
): Promise<ScoringBlueprintCandidate> {
  const skillEducationInput = {
    ...input,
    scoringItems: {
      dimensions: input.scoringItems.dimensions.filter(
        (dimension) => dimension === "educationBackground" || dimension === "skillMatch",
      ),
      enabledRuleIds: input.scoringItems.enabledRuleIds.filter(
        (ruleId) => ruleId.startsWith("education.") || ruleId.startsWith("skill."),
      ),
    },
  };
  const remainingDimensionsInput = {
    ...input,
    scoringItems: {
      dimensions: input.scoringItems.dimensions.filter(
        (dimension) => dimension !== "educationBackground" && dimension !== "skillMatch",
      ),
      enabledRuleIds: input.scoringItems.enabledRuleIds.filter(
        (ruleId) => !(ruleId.startsWith("education.") || ruleId.startsWith("skill.")),
      ),
    },
  };
  let skillEducation: SkillEducationCandidate | null = null;
  let remainingDimensions: RemainingDimensionsCandidate | null = null;
  function generateSkillEducation() {
    return generateStructuredWithMastraAgent({
      agent,
      fallbackToTextGeneration: true,
      maxOutputTokens: 4000,
      prompt: [
        "请只根据岗位 JD 和基础评分项目提取技能与学历评分依据。只返回一个 JSON 对象，不要输出分析过程、Markdown 或解释。",
        'JSON 字段必须严格为：{"coreSkills":[{"normalizedSkill":"标准技能名","sourceText":"JD连续原文","requirementGroup":"组内临时标识","satisfactionMode":"all|any"}],"auxiliarySkills":[同结构],"educationExpectation":{"degreeLevel":"bachelor","majorExpectation":"专业要求","sourceText":"JD连续原文"}}。degreeLevel 只能是 associate、bachelor、master、doctorate 或 JSON null；majorExpectation 可为 JSON null；没有学历要求时 educationExpectation 返回 JSON null。没有技能时数组返回 []，不得省略任何字段。',
        "不得推测或生成硬性门槛、权重、扣分数值、优先条件或排除条件。enabledRuleIds 只表示启用的基础规则，不代表分值。",
        "只能复述 description 或 prompt 中存在的要求，每项 sourceText 必须逐字复制其中的最短连续原文片段，禁止删词、改写或拼接；括号内的“请 HR 确认”等文字也不得擅自删除。对于新版岗位，prompt 是 HR 确认后的完整 JD。",
        "技能只包括岗位明确要求候选人掌握的技术语言、框架、工具、平台或专业方法；岗位职责、经验、项目、管理行为、业务成果和软能力不得作为技能。",
        "核心技能只来自任职要求、核心技能或技能要求中“必须、精通、熟练掌握”等明确强要求；辅助技能来自“熟悉、了解”等软要求。不要把职责动作拆成技能。合并同义项后核心技能最多 8 项，辅助技能最多 8 项。",
        "必须为每项技能设置 requirementGroup 和 satisfactionMode。JD 原文明示“且、并且、同时、和、与、及、以及、均需、and、all of”等并列关系时，相关技能使用同一个 requirementGroup 且 satisfactionMode=all；明示“或、或者、任一、任选、至少一种、其中之一、二选一、or、any of、one of”等选择关系时，相关技能使用同一个 requirementGroup 且 satisfactionMode=any。若同一句同时出现多种连接词，按其实际逻辑作用域拆组；严格服从原文，不得改写关系。",
        "JD 没有明示并列或选择关系时，由你根据岗位语义判断：互为替代、属于同类方案且掌握任意一种即可完成同一职责的技能，放入同一个 any 组；需要共同使用、能力互补或分别支撑不同职责的技能，放入同一个 all 组或各自独立的 all 组。不得仅因技能出现在同一句、使用顿号或同属技术栈就判为 any；无法确认可替代时使用独立 all 组。",
        "同一个要求组内所有技能的 requirementGroup 和 satisfactionMode 必须完全一致；不同要求不得复用 requirementGroup。any 组至少包含两个技能，独立技能使用只含自身的 all 组。示例：“React 或 Vue 任一”是一个 any 组；“React、TypeScript 均需熟练掌握”是一个 all 组；“熟悉主流前端框架，如 React、Vue”在没有其他限制时可判断为一个 any 组。",
        "优先条件或加分项下的内容不得进入技能；从业背景、行业经历和项目经历应留在经验或项目维度。",
        "educationExpectation 只提取 JD 明确写出的学历层级和专业要求；没有则返回 null。不要生成 ID、分数或扣分。",
        JSON.stringify(skillEducationInput),
      ].join("\n"),
      retryOnInvalid: true,
      schema: skillEducationCandidateSchema,
      temperature: 0,
      timeoutMs: 120_000,
      validate: (value) => {
        validateScoringCandidateSources(value, skillEducationInput);
        validateGeneratedSkillRequirementGroups(value);
      },
    });
  }
  function generateRemainingDimensions() {
    return generateStructuredWithMastraAgent({
      agent,
      fallbackToTextGeneration: true,
      maxOutputTokens: 5000,
      prompt: [
        "请只根据岗位 JD 和基础评分项目提取经验、项目、潜力与稳定性评分依据。只返回一个 JSON 对象，不要输出分析过程、Markdown 或解释。",
        'JSON 字段必须严格为：{"requiredRelevantExperiences":[{"relevanceScope":"capability|domain|industry|role|total_employment","scopeDescription":"经验范围","sourceText":"JD连续原文","years":数字}],"dimensionExpectations":{"experienceRelevance":[{"expectation":"判断依据","sourceText":"JD连续原文"}],"projectMatch":[同结构],"potential":[同结构],"stability":[同结构]}}。没有内容时数组返回 []，不得省略任何字段。',
        "不得推测或生成硬性门槛、权重、扣分数值、优先条件或排除条件。enabledRuleIds 只表示启用的基础规则，不代表分值。",
        "只能复述 description 或 prompt 中存在的要求，每项 sourceText 必须逐字复制其中的最短连续原文片段，禁止删词、改写或拼接；括号内的“请 HR 确认”等文字也不得擅自删除。对于新版岗位，prompt 是 HR 确认后的完整 JD。",
        "保留全部明确经验年限到 requiredRelevantExperiences，不要自行合并。只有原文明示总工作经验、累计工作经验或工作年限时才用 total_employment；前端、管理等限定经验使用对应 role 或 capability。",
        "优先条件或加分项下的内容不得进入基础评分依据；这些内容缺失时不能产生扣分。不要把同一要求同时放进技能、经验和项目。",
        "experienceRelevance 填行业、岗位、管理或业务经验要求，最多 6 项；团队人数、管理范围等无法用单一年限表达的条件也要保留，相邻的管理年限和团队规模合并为一项。",
        "projectMatch 不是摘抄岗位职责，而是根据整个岗位最需要候选人证明的项目经历，提炼为最多 3 项岗位级项目标准。按核心业务交付、复杂技术/工程体系、关键业务成果等主题合并；expectation 每项建议 20～50 字、最多 80 字，描述项目类型、复杂度、候选人角色和预期成果，不要逐条复述职责；sourceText 单独保留最能支撑该标准的 JD 连续原文。经验和项目均需重点阅读岗位职责。",
        "potential 只提取对候选人本人学习、成长、创新或能力进阶的明确要求；培养下属、人才梯队和团队效率属于管理经验。stability 只填任职连续性、跳槽和空档要求，驻外意愿、工作地点、语言或证书不得放入 stability。无原文依据的维度返回空数组。",
        "工作地点、驻外意愿、语言能力和证书不属于经验相关性。海外版本开发等实际经历可保留，但不要附加驻外意愿。不要生成 ID、分数或扣分。",
        JSON.stringify(remainingDimensionsInput),
      ].join("\n"),
      retryOnInvalid: true,
      schema: experienceProjectPotentialStabilityCandidateSchema,
      temperature: 0,
      timeoutMs: 120_000,
      validate: (value) => validateRemainingDimensionsCandidate(value, remainingDimensionsInput),
    });
  }
  async function taggedSkillEducation() {
    return { candidate: await generateSkillEducation(), type: "skill-education" as const };
  }
  async function taggedRemainingDimensions() {
    return { candidate: await generateRemainingDimensions(), type: "remaining" as const };
  }
  type TaggedCandidate =
    | { candidate: RemainingDimensionsCandidate; type: "remaining" }
    | { candidate: SkillEducationCandidate; type: "skill-education" };
  const pending = new Map<string, Promise<TaggedCandidate>>([
    ["skill-education", taggedSkillEducation()],
    ["remaining", taggedRemainingDimensions()],
  ]);
  while (pending.size > 0) {
    const result = await Promise.race(pending.values());
    pending.delete(result.type);
    if (result.type === "skill-education") {
      skillEducation = result.candidate;
    } else {
      remainingDimensions = result.candidate;
    }
    await onProgress?.(toProgressRuleDraft(skillEducation, remainingDimensions));
  }
  if (!(skillEducation && remainingDimensions)) {
    throw new Error("评分规则生成结果不完整");
  }
  return {
    ...skillEducation,
    dimensionExpectations: {
      educationBackground: [],
      skillMatch: [],
      ...remainingDimensions.dimensionExpectations,
    },
    requiredRelevantExperiences: remainingDimensions.requiredRelevantExperiences,
  };
}

function generateHardGateCompilerCandidate(
  hardGates: JobDescriptionStructuredConfig["hardGates"],
  agent: MastraGeneratorLike,
): Promise<HardGateCompilerCandidate> {
  if (Object.values(hardGates).every((value) => !value.trim())) {
    return Promise.resolve({ hardGateAtoms: [] });
  }
  return generateStructuredWithMastraAgent({
    agent,
    fallbackToTextGeneration: true,
    maxOutputTokens: 3000,
    prompt: [
      "请只把 HR 已配置的硬性门槛拆成原子要求。只返回一个 JSON 对象，不要输出分析过程、Markdown 或解释。",
      'JSON 字段必须严格为：{"hardGateAtoms":[{"category":"education|language_ability|other|required_certificates|required_skills|work_experience|work_location","normalizedRequirement":"规范化要求","sourceText":"对应门槛分类的连续原文"}]}。没有门槛时返回 {"hardGateAtoms":[]}。',
      "不得读取、推测或补充岗位 JD 的要求；空分类不生成。",
      "必须完整覆盖每个非空分类中的全部要求。以换行、分号或句号分隔的每段都至少返回一个原子项，不得遗漏任何一段。",
      "严格保留原文的 AND / OR 关系：原文明示“且、并、同时”时才拆成需要全部满足的原子项；原文明示“或、任一、均可”时，整个选择关系保留为一个原子项，不得拆成多个都必须满足的原子项。",
      "如果同一段列举多个同类技能但没有连接词，由模型根据语义判断它们是需要共同掌握，还是掌握任意一种即可；判断为任意一种即可时，也必须保留为一个原子项。",
      "每项 sourceText 必须是对应硬性门槛分类文本中的连续原文片段。",
      "category 映射：education=education，languageAbility=language_ability，other=other，requiredCertificates=required_certificates，requiredSkills=required_skills，workExperience=work_experience，workLocation=work_location。",
      "不要生成评分维度、技能分类、经验评分依据、分数或扣分。",
      JSON.stringify({ hardGates }),
    ].join("\n"),
    retryOnInvalid: true,
    schema: hardGateCompilerCandidateSchema,
    temperature: 0,
    timeoutMs: 120_000,
  });
}

export async function generateEvaluationBlueprintCandidate(
  input: EvaluationBlueprintGenerationJob,
  onProgress?: JobEvaluationRuleDraftProgress,
  agent: MastraGeneratorLike = jobEvaluationBlueprintJsonAgent,
): Promise<BlueprintCompilerCandidate> {
  const [scoringCandidate, hardGateCandidate] = await Promise.all([
    generateScoringBlueprintCandidate(
      buildScoringBlueprintGenerationInput(input),
      agent,
      onProgress,
    ),
    generateHardGateCompilerCandidate(input.structuredConfig.hardGates, agent),
  ]);
  return { ...scoringCandidate, ...hardGateCandidate };
}
