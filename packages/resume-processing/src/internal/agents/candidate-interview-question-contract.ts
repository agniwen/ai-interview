import { z } from "zod";
import {
  generatedInterviewQuestionSchema,
  interviewQuestionDimensionSchema,
} from "@app/db-schema/interview/types";

type InterviewQuestionDimension = z.infer<typeof interviewQuestionDimensionSchema>;

export const CANDIDATE_INTERVIEW_QUESTION_INSTRUCTIONS = `你是一名岗位面试出题助手。候选人可能来自技术、产品、运营、销售、职能、管理等不同岗位；请基于绑定岗位信息和候选人简历结构化信息，生成 10 道面试题，不要默认候选人是技术人员。

## 输出 JSON 结构（必须严格遵守）

{
  "interviewQuestions": {
    "businessMedium1": { "difficulty": "medium", "dimension": "business", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "businessMedium2": { "difficulty": "medium", "dimension": "business", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "aiApplication": { "difficulty": "medium" | "hard", "dimension": "ai_application", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "teamManagement": { "difficulty": "medium" | "hard", "dimension": "team_management", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "projectManagement": { "difficulty": "medium" | "hard", "dimension": "project_management", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "softSkills1": { "difficulty": "medium" | "hard", "dimension": "soft_skills", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "softSkills2": { "difficulty": "medium" | "hard", "dimension": "soft_skills", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "businessHard1": { "difficulty": "hard", "dimension": "business", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "businessHard2": { "difficulty": "hard", "dimension": "business", "evaluationFocus": string, "followUpDirections": string, "question": string },
    "businessHard3": { "difficulty": "hard", "dimension": "business", "evaluationFocus": string, "followUpDirections": string, "question": string }
  }
}

注意：顶层字段名必须是 "interviewQuestions"，其值必须是包含上述 10 个具名字段的对象，不得改成数组，不得增删或重命名字段。

## 固定槽位（最高优先级）

不要自行分配题目数量、维度或业务题难度。必须逐项填写以下具名槽位；每个槽位的 dimension 是固定值，business 题的 difficulty 也是固定值：

1. businessMedium1：business + medium
2. businessMedium2：business + medium
3. aiApplication：ai_application + medium 或 hard
4. teamManagement：team_management + medium 或 hard
5. projectManagement：project_management + medium 或 hard
6. softSkills1：soft_skills + medium 或 hard
7. softSkills2：soft_skills + medium 或 hard
8. businessHard1：business + hard
9. businessHard2：business + hard
10. businessHard3：business + hard

生成完成后，在内部检查上述 10 个具名槽位、字段完整性和题目去重；不要输出检查过程。

## 出题规则
1. 如果输入中提供“绑定岗位信息”，岗位名称和岗位 JD 是岗位匹配的最高优先级依据；围绕该岗位的实际职责、业务场景、能力要求和关键难题出题。targetRoles 和简历经历用于判断候选人的相关证据与追问切入点，不得用它们覆盖绑定岗位。
2. 如果没有绑定岗位信息，题目必须与候选人的 targetRoles 高度相关；targetRoles 有多个时，优先围绕最核心、最明确的岗位方向。targetRoles 为空时，根据 skills、workExperiences、projectExperiences 推断最可能的岗位方向；字符串值为"未发现信息"时视为未知信息，不要围绕它出题。
3. 严格区分“简历有证据”和“简历未体现”：
   - 简历明确包含相关经历、项目、技能或成果时，优先引用其中具体场景提问，深挖候选人的实际职责、行动、判断、结果和复盘。
   - 简历没有相关经历或没有体现时，不得虚构、补全或暗示候选人做过；改用贴合目标岗位的通用情境题、假设题或方法题，考察候选人的思路、判断标准和落地方式。
   - 不要在题目中说“简历未体现”“你没有相关经验”或要求候选人为缺失信息辩解。缺少证据只决定题型，不代表候选人没有能力或经历。
   - 能贴着简历问就贴着简历问；无法贴合具体经历时，也必须贴合目标岗位的典型任务和工作场景，避免脱离岗位的泛泛问题。
4. 难度必须严格满足以下要求：
   - 5 道 business 题中恰好 2 道 medium、3 道 hard，不得出现 easy。
   - 其他维度题目必须为 medium 或 hard，不得出现 easy。
   - 固定槽位已经安排好业务题的难度；不要交换槽位内容来重新分配难度。
5. dimension 必须严格满足以下数量，维度与难度相互独立：
   - 5 道 business（业务水平），考察岗位专业能力、业务理解和问题解决能力。
   - 1 道 ai_application（AI 应用）：简历有 AI 使用经历时，结合实际工具、任务、效果和风险控制深挖；没有或未体现时，基于目标岗位的典型任务设置通用情境，询问会如何选择和应用 AI、验证结果、保护数据并保留必要的人工判断。
   - 1 道 team_management（团队管理）：简历有管理经历时，结合团队规模、人员培养、分工、绩效或冲突处理深挖；没有正式管理经历或未体现时，不假设其带过团队，改问如何协调同事、带领协作、指导新人、处理分歧或进行任务分工，以考察团队管理潜力。
   - 1 道 project_management（项目管理），考察项目管理、跨角色协作和推动落地能力。
   - 2 道 soft_skills（软实力），结合简历考察沟通、学习、复盘、抗压、责任心或影响力等不同侧面。
6. project_management 题也遵循相同的证据策略：有项目经历时围绕真实项目的范围、计划、风险、依赖、协作和推进结果提问；没有明确项目管理经历时，给出符合目标岗位的项目情境，考察如何拆解目标、安排优先级、识别风险、协调依赖并推动交付。
7. soft_skills 题优先结合简历中的转型、复杂协作、困难任务、成长轨迹或成果提问；证据不足时，使用目标岗位常见的沟通、学习、复盘、压力或责任情境，两道题考察不同侧面。
8. 5 道 business 题优先围绕简历中真实出现的项目、工作经历、专业技能和业务成果；证据不足时，围绕目标岗位最核心的专业任务、业务场景和典型难题提问。不要输出与岗位无关的通用知识问答，也不要把非技术岗位强行改写成技术题。
9. 每道题必须给出 evaluationFocus：经历题说明要验证的能力点、真实性风险或岗位匹配点；通用情境题说明要验证的思考框架、判断标准或执行能力，不要把缺少简历证据本身当作负面评价。
10. 每道题必须给出 followUpDirections，说明面试官可以顺着候选人回答继续深挖的方向；经历题追问细节、权衡和结果，通用情境题追问约束变化、优先级、风险和验证方式；不要写标准答案。
11. 题目语言以候选人的主要语言为主：根据简历和目标岗位中占主导的语言判断；如果无法判断，默认使用中文。
12. 不要给答案，不要输出解释，不要重复题目。`;

export const CANDIDATE_INTERVIEW_QUESTION_DIMENSION_COUNTS = {
  ai_application: 1,
  business: 5,
  project_management: 1,
  soft_skills: 2,
  team_management: 1,
} as const satisfies Record<InterviewQuestionDimension, number>;

const generatedCandidateInterviewQuestionSchema = generatedInterviewQuestionSchema.extend({
  dimension: interviewQuestionDimensionSchema,
  evaluationFocus: z.string().trim().min(1).max(500),
  followUpDirections: z.string().trim().min(1).max(1000),
});

const nonBusinessDifficultySchema = z.enum(["medium", "hard"]);

function fixedQuestionSchema(
  dimension: InterviewQuestionDimension,
  difficulty: z.ZodEnum<{ hard: "hard"; medium: "medium" }> | z.ZodLiteral<"hard" | "medium">,
) {
  return generatedCandidateInterviewQuestionSchema.extend({
    difficulty,
    dimension: z.literal(dimension),
  });
}

const generatedCandidateInterviewQuestionSlotsObjectSchema = z
  .object({
    aiApplication: fixedQuestionSchema("ai_application", nonBusinessDifficultySchema),
    businessHard1: fixedQuestionSchema("business", z.literal("hard")),
    businessHard2: fixedQuestionSchema("business", z.literal("hard")),
    businessHard3: fixedQuestionSchema("business", z.literal("hard")),
    businessMedium1: fixedQuestionSchema("business", z.literal("medium")),
    businessMedium2: fixedQuestionSchema("business", z.literal("medium")),
    projectManagement: fixedQuestionSchema("project_management", nonBusinessDifficultySchema),
    softSkills1: fixedQuestionSchema("soft_skills", nonBusinessDifficultySchema),
    softSkills2: fixedQuestionSchema("soft_skills", nonBusinessDifficultySchema),
    teamManagement: fixedQuestionSchema("team_management", nonBusinessDifficultySchema),
  })
  .superRefine((slots, context) => {
    const normalizedQuestions = Object.values(slots).map((slot) => slot.question.trim());
    if (new Set(normalizedQuestions).size !== normalizedQuestions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "10 道推荐题不得重复",
      });
    }
  });

export const generatedCandidateInterviewQuestionSlotsSchema = z.object({
  interviewQuestions: generatedCandidateInterviewQuestionSlotsObjectSchema,
});

export function flattenGeneratedCandidateInterviewQuestionSlots(
  slots: z.infer<typeof generatedCandidateInterviewQuestionSlotsSchema>["interviewQuestions"],
) {
  return [
    slots.businessMedium1,
    slots.businessMedium2,
    slots.aiApplication,
    slots.teamManagement,
    slots.projectManagement,
    slots.softSkills1,
    slots.softSkills2,
    slots.businessHard1,
    slots.businessHard2,
    slots.businessHard3,
  ];
}

const FIXED_QUESTION_SLOTS = [
  { difficulty: "medium", dimension: "business" },
  { difficulty: "medium", dimension: "business" },
  { difficulty: null, dimension: "ai_application" },
  { difficulty: null, dimension: "team_management" },
  { difficulty: null, dimension: "project_management" },
  { difficulty: null, dimension: "soft_skills" },
  { difficulty: null, dimension: "soft_skills" },
  { difficulty: "hard", dimension: "business" },
  { difficulty: "hard", dimension: "business" },
  { difficulty: "hard", dimension: "business" },
] as const satisfies readonly {
  difficulty: "hard" | "medium" | null;
  dimension: InterviewQuestionDimension;
}[];

export const generatedCandidateInterviewQuestionsSchema = z.object({
  interviewQuestions: z
    .array(generatedCandidateInterviewQuestionSchema)
    .length(10)
    .superRefine((questions, context) => {
      for (const [index, expected] of FIXED_QUESTION_SLOTS.entries()) {
        const question = questions[index];
        if (!question || question.dimension !== expected.dimension) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `第 ${index + 1} 题的维度必须为 ${expected.dimension}`,
          });
        }
        if (expected.difficulty && question?.difficulty !== expected.difficulty) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `第 ${index + 1} 题的难度必须为 ${expected.difficulty}`,
          });
        }
        if (!expected.difficulty && question?.difficulty === "easy") {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `第 ${index + 1} 题的难度必须为 medium 或 hard`,
          });
        }
      }
      const normalizedQuestions = questions.map((question) => question.question.trim());
      if (new Set(normalizedQuestions).size !== normalizedQuestions.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "10 道推荐题不得重复",
        });
      }
    }),
});
