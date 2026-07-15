import type { JSONSchema7 } from "json-schema";

/**
 * JSON Schema for MastraDBMessage
 */
const CONTENT_SCHEMA: JSONSchema7 = {
  anyOf: [
    { type: "string" },
    {
      description: "结构化内容（格式 2，包含 parts）",
      type: "object",
    },
    {
      description: "内容部分数组",
      items: { type: "object" },
      type: "array",
    },
  ],
};

const MESSAGE_SCHEMA: JSONSchema7 = {
  properties: {
    content: CONTENT_SCHEMA,
    role: { enum: ["user", "assistant", "system", "tool"], type: "string" },
  },
  required: ["role", "content"],
  type: "object",
};

/**
 * JSON Schema for ScorerRunInputForAgent (used as scoringInput.input)
 */
const SCORER_RUN_INPUT_FOR_AGENT: JSONSchema7 = {
  description: "ScorerRunInputForAgent",
  properties: {
    inputMessages: {
      description: "用户输入消息（MastraDBMessage[]）",
      items: MESSAGE_SCHEMA,
      type: "array",
    },
    rememberedMessages: {
      description: "来自记忆的消息（MastraDBMessage[]）",
      items: MESSAGE_SCHEMA,
      type: "array",
    },
    systemMessages: {
      description: "系统消息（CoreMessage[]）",
      items: {
        properties: {
          content: CONTENT_SCHEMA,
          role: { enum: ["system"], type: "string" },
        },
        required: ["role", "content"],
        type: "object",
      },
      type: "array",
    },
    taggedSystemMessages: {
      additionalProperties: {
        items: {
          properties: {
            content: CONTENT_SCHEMA,
            role: { enum: ["system"], type: "string" },
          },
          required: ["role", "content"],
          type: "object",
        },
        type: "array",
      },
      description: "带标签的系统消息（Record<string, CoreSystemMessage[]>）",
      type: "object",
    },
  },
  required: ["inputMessages", "rememberedMessages", "systemMessages", "taggedSystemMessages"],
  type: "object",
};

/**
 * JSON Schema for ScorerRunOutputForAgent (used as scoringInput.output)
 * MastraDBMessage[]
 */
const SCORER_RUN_OUTPUT_FOR_AGENT: JSONSchema7 = {
  description: "ScorerRunOutputForAgent (MastraDBMessage[])",
  items: MESSAGE_SCHEMA,
  type: "array",
};

/**
 * JSON Schema for scorer input (scoringInputSchema) for agent-type scorers.
 * - input: ScorerRunInputForAgent
 * - output: ScorerRunOutputForAgent
 */
const SCORER_AGENT_INPUT_SCHEMA: JSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  description: "智能体类型评分器的输入（scoringInputSchema）",
  properties: {
    additionalContext: {
      additionalProperties: true,
      description: "附加上下文（可选）",
      type: "object",
    },
    input: SCORER_RUN_INPUT_FOR_AGENT,
    output: SCORER_RUN_OUTPUT_FOR_AGENT,
    requestContext: {
      additionalProperties: true,
      description: "请求上下文（可选）",
      type: "object",
    },
    runId: {
      description: "运行 ID（可选）",
      type: "string",
    },
  },
  required: [],
  type: "object",
};

/**
 * JSON Schema for scorer input (scoringInputSchema) for custom scorers.
 * - input: any
 * - output: any
 */
const SCORER_CUSTOM_INPUT_SCHEMA: JSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  description: "自定义评分器的输入（scoringInputSchema）",
  properties: {
    additionalContext: {
      additionalProperties: true,
      description: "附加上下文（可选）",
      type: "object",
    },
    input: {
      description: "传递给被评分实体的输入（任意类型）",
    },
    output: {
      description: "被评分实体的输出（任意类型）",
    },
    requestContext: {
      additionalProperties: true,
      description: "请求上下文（可选）",
      type: "object",
    },
    runId: {
      description: "运行 ID（可选）",
      type: "string",
    },
  },
  required: [],
  type: "object",
};

/**
 * JSON Schema for scorer ground truth — permissive, accepts any shape.
 * Ground truth depends on what the scorer evaluates and is user-defined.
 */
const SCORER_OUTPUT_SCHEMA: JSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  description: "评分器标准答案（任意结构）",
};

/**
 * Hook that returns scorer input/output schemas.
 * - agentInputSchema: for agent-type scorers (ScorerRunInputForAgent/ScorerRunOutputForAgent)
 * - customInputSchema: for custom scorers (input/output as any)
 * - outputSchema: score + reason from scoreRowDataSchema
 */
export function useScorerSchema() {
  return {
    agentInputSchema: SCORER_AGENT_INPUT_SCHEMA,
    customInputSchema: SCORER_CUSTOM_INPUT_SCHEMA,
    error: null as Error | null,
    isLoading: false,
    outputSchema: SCORER_OUTPUT_SCHEMA,
  };
}
