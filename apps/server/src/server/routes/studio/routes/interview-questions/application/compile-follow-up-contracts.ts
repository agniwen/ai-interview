import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  InterviewQuestionFollowUpContract,
  InterviewQuestionTemplateSnapshotQuestion,
} from "@app/db-schema/interview-question-templates";

const compiledFacetSchema = z.object({
  label: z.string().trim().min(1).max(80),
  sourceField: z.enum(["question", "evaluation_focus", "follow_up_directions"]),
  sourceText: z.string().trim().min(1).max(300),
});

const compilerOutputSchema = z.object({
  contracts: z.array(
    z.object({
      coverageMode: z.enum(["all_required", "sufficient_for_evaluation"]),
      facets: z.array(compiledFacetSchema).min(1).max(16),
      questionId: z.string().trim().min(1),
    }),
  ),
});

type CompilerOutput = z.infer<typeof compilerOutputSchema>;
export type FollowUpContractGenerator = (input: {
  prompt: string;
  schema: typeof compilerOutputSchema;
}) => Promise<CompilerOutput>;

const PROMPT = `你是可配置 AI 面试题的追问契约编译器。请把每道题编译成简短、可核验的信息项，供语音 Agent 判断候选人还缺少哪些信息。

规则：
- 每个输入 questionId 必须且只能输出一次，不得遗漏或增加题目。
- facets 必须基于该题自己的 question、evaluationFocus 或 followUpDirections；sourceText 填写对应配置中的判断依据，可保留原文，也可在不改变语义的前提下简短概括。
- label 是候选人可听到的简短信息项名称，通常 2–12 个汉字，不得写成完整问句，不得包含“请回答”“请补充”等话术。
- 枚举、编号、多个明确事实字段使用 coverageMode=all_required，并拆成原子信息项。
- 开放讨论、经历复盘、能力评估使用 coverageMode=sufficient_for_evaluation；只列出能判断考核意图的关键维度。
- 不得生成题目配置中没有依据的信息项。
- 同义重复的信息项只保留一个；每题最多 16 项。

输入 JSON：
{questions}`;

function sourceValue(
  question: InterviewQuestionTemplateSnapshotQuestion,
  field: z.infer<typeof compiledFacetSchema>["sourceField"],
): string {
  if (field === "question") {
    return question.content;
  }
  if (field === "evaluation_focus") {
    return question.evaluationFocus ?? "";
  }
  return question.followUpDirections ?? "";
}

function facetId(questionId: string, facet: z.infer<typeof compiledFacetSchema>): string {
  return `facet_${createHash("sha256")
    .update(`${questionId}\u0000${facet.sourceField}\u0000${facet.sourceText}\u0000${facet.label}`)
    .digest("hex")
    .slice(0, 16)}`;
}

export function normalizeCompiledFollowUpContracts(
  questions: InterviewQuestionTemplateSnapshotQuestion[],
  output: CompilerOutput,
): Map<string, InterviewQuestionFollowUpContract> {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  if (output.contracts.length !== questions.length) {
    throw new Error("追问契约数量与题目数量不一致");
  }

  const contracts = new Map<string, InterviewQuestionFollowUpContract>();
  for (const compiled of output.contracts) {
    const question = questionById.get(compiled.questionId);
    if (!question || contracts.has(compiled.questionId)) {
      throw new Error(`追问契约包含未知或重复题目：${compiled.questionId}`);
    }
    const seenLabels = new Set<string>();
    const facets = compiled.facets.flatMap((facet) => {
      const source = sourceValue(question, facet.sourceField);
      if (!source.trim()) {
        throw new Error(`追问信息项引用了空配置字段：${compiled.questionId}/${facet.label}`);
      }
      const labelKey = facet.label.replaceAll(/\s+/g, "").toLocaleLowerCase();
      if (seenLabels.has(labelKey)) {
        return [];
      }
      seenLabels.add(labelKey);
      return [{ ...facet, id: facetId(compiled.questionId, facet) }];
    });
    if (facets.length === 0) {
      throw new Error(`追问契约没有有效信息项：${compiled.questionId}`);
    }
    contracts.set(compiled.questionId, {
      coverageMode: compiled.coverageMode,
      facets,
      schemaVersion: 1,
    });
  }
  return contracts;
}

export async function compileFollowUpContracts(
  questions: InterviewQuestionTemplateSnapshotQuestion[],
  generate: FollowUpContractGenerator,
): Promise<Map<string, InterviewQuestionFollowUpContract>> {
  if (questions.length === 0) {
    return new Map();
  }
  const compilerInput = questions.map((question) => ({
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
    question: question.content.trim(),
    questionId: question.id,
  }));
  const output = await generate({
    prompt: PROMPT.replace("{questions}", JSON.stringify(compilerInput)),
    schema: compilerOutputSchema,
  });
  return normalizeCompiledFollowUpContracts(questions, output);
}

export function attachFollowUpContracts(
  questions: InterviewQuestionTemplateSnapshotQuestion[],
  contracts: ReadonlyMap<string, InterviewQuestionFollowUpContract>,
): InterviewQuestionTemplateSnapshotQuestion[] {
  return questions.map((question) => ({
    ...question,
    followUpContract: contracts.get(question.id) ?? null,
  }));
}
