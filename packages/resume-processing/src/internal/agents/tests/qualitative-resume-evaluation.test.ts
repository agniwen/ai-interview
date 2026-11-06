import {
  generateStructuredWithMastraAgent,
  StructuredOutputValidationError,
} from "@app/ai-runtime/simple-generators";
import type { MastraGeneratorLike } from "@app/ai-runtime/simple-generators";
import type { CurrentQualitativeResumeEvaluation } from "@app/db-schema/qualitative-resume-evaluation";
import { describe, expect, it, vi } from "vitest";
import {
  buildQualitativeResumeEvaluationPrompt,
  generateQualitativeResumeEvaluation,
} from "../qualitative-resume-evaluation";
import type { QualitativeResumeEvaluationInput } from "../qualitative-resume-evaluation";

const input: QualitativeResumeEvaluationInput = {
  evaluationAsOf: "2026-11-05",
  jobDescriptionName: "产品经理",
  jobDescriptionPrompt: "负责企业软件产品，具备招聘行业经验。",
  resumeProfile: {
    age: null,
    educationExperiences: [],
    email: null,
    gender: null,
    name: "匿名候选人",
    personalStrengths: [],
    phone: null,
    projectExperiences: [],
    schools: [],
    skills: [],
    targetRoles: [],
    workExperiences: [],
    workYears: null,
  },
  resumeText: "负责企业软件产品。",
};

const dimension = {
  basis: "job",
  evaluation: "负责企业软件产品，招聘行业经验待确认。",
  level: "undecided",
} as const;
const output = {
  conciseOverall: "有企业软件产品经验，招聘行业经验待确认。",
  detailedOverall: {
    judgment: "有企业软件产品经验，招聘行业经验待确认。",
    matchingEvidence: [
      {
        content: "有企业软件产品经验。",
        jobRequirement: "负责企业软件产品",
        point: "企业软件",
        resumeEvidence: "负责企业软件产品",
      },
    ],
    risks: [
      {
        content: "招聘行业经验待确认。",
        jobRequirement: "具备招聘行业经验",
        point: "行业经验",
        resumeEvidence: null,
      },
    ],
  },
  dimensions: {
    educationBackground: dimension,
    experienceRelevance: dimension,
    potential: dimension,
    projectMatch: dimension,
    skillMatch: dimension,
    stability: dimension,
  },
  recommendationLevel: "undecided",
  seniorityRecommendation: null,
  teamPositioning: null,
} satisfies Omit<CurrentQualitativeResumeEvaluation, "schemaVersion">;

function generateFromText(...responses: string[]) {
  const generate = vi.fn<MastraGeneratorLike["generate"]>();
  for (const response of responses) {
    generate.mockResolvedValueOnce({ text: response });
  }
  const result = generateQualitativeResumeEvaluation(input, (request) =>
    generateStructuredWithMastraAgent({
      ...request,
      agent: { generate },
      textGenerationFirst: true,
    }),
  );
  return { generate, result };
}

describe("qualitative resume evaluation from model text", () => {
  it("includes the exact output contract for models without native structured output", () => {
    const prompt = buildQualitativeResumeEvaluationPrompt(input);
    const schema = JSON.parse(prompt.slice(prompt.indexOf('{"$schema"')));

    expect(schema.properties.detailedOverall).toMatchObject({
      additionalProperties: false,
      required: ["judgment", "matchingEvidence", "risks"],
    });
    expect(Object.keys(schema.properties.detailedOverall.properties)).toEqual(
      expect.arrayContaining(["judgment", "matchingEvidence", "risks"]),
    );
    expect(schema.properties.detailedOverall.properties).not.toHaveProperty("risksNote");
    for (const key of Object.keys(output.dimensions)) {
      expect(schema.properties.dimensions.properties[key]).toMatchObject({
        properties: { basis: { enum: ["job", "general", "both"] } },
        required: expect.arrayContaining(["basis"]),
      });
    }
  });

  it("keeps valid structured risks when the model adds a risksNote", async () => {
    const response = JSON.stringify({
      ...output,
      detailedOverall: { ...output.detailedOverall, risksNote: "建议面试中确认。" },
    });
    const { generate, result } = generateFromText(response, response);

    await expect(result).resolves.toEqual({ ...output, schemaVersion: 3 });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("retries with missing basis paths and uses only the model's corrected values", async () => {
    const { basis: _basis, ...missingBasis } = dimension;
    const response = JSON.stringify({
      ...output,
      dimensions: Object.fromEntries(
        Object.keys(output.dimensions).map((key) => [key, missingBasis]),
      ),
    });
    const { generate, result } = generateFromText(response, JSON.stringify(output));

    await expect(result).resolves.toEqual({ ...output, schemaVersion: 3 });
    expect(generate).toHaveBeenCalledTimes(2);
    const retryPrompt = generate.mock.calls[1]?.[0];
    for (const key of Object.keys(output.dimensions)) {
      expect(retryPrompt).toContain(JSON.stringify(["dimensions", key, "basis"]));
    }
  });

  it("rejects a risksNote without the required structured risks", async () => {
    const { risks: _risks, ...details } = output.detailedOverall;
    const response = JSON.stringify({
      ...output,
      detailedOverall: { ...details, risksNote: "建议面试中确认。" },
    });
    const { result } = generateFromText(response, response);

    await expect(result).rejects.toThrow(StructuredOutputValidationError);
  });
});
