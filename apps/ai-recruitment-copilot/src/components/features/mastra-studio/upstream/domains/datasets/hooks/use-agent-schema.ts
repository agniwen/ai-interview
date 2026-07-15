import type { JSONSchema7 } from "json-schema";

/**
 * JSON Schema for MessageListInput type.
 * Can be a string, array of strings, message object, or array of message objects.
 */
/**
 * Content can be a plain string or an array of content parts (text, image, tool-call, etc.).
 * Matches AI SDK CoreMessage / ModelMessage content field.
 */
const messageContentSchema: JSONSchema7 = {
  anyOf: [
    { type: "string" },
    {
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
  ],
};

const messageObjectSchema: JSONSchema7 = {
  properties: {
    content: messageContentSchema,
    role: { enum: ["user", "assistant", "system", "tool"], type: "string" },
  },
  required: ["role", "content"],
  type: "object",
};

const AGENT_INPUT_SCHEMA: JSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  anyOf: [
    { description: "简单文本消息", type: "string" },
    {
      description: "文本消息数组",
      items: { type: "string" },
      type: "array",
    },
    {
      ...messageObjectSchema,
      description: "单个消息对象",
    },
    {
      description: "消息对象数组",
      items: messageObjectSchema,
      type: "array",
    },
  ],
  description: "智能体消息输入（MessageListInput）",
};

/**
 * JSON Schema for agent output — matches the experiment executor's trimmedOutput shape.
 * All properties optional so partial ground truth (e.g. just text) is valid.
 */
const AGENT_OUTPUT_SCHEMA: JSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  description: "智能体 generate() 输出",
  properties: {
    files: {
      description: "生成的文件",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    object: { description: "结构化输出（如有）" },
    reasoningText: { description: "推理文本（如有）", type: "string" },
    sources: {
      description: "引用的来源",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    text: { description: "文本响应", type: "string" },
    toolCalls: {
      description: "智能体发起的工具调用",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    toolResults: {
      description: "工具执行结果",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    usage: {
      description: "Token 用量",
      properties: {
        completionTokens: { type: "number" },
        promptTokens: { type: "number" },
        totalTokens: { type: "number" },
      },
      type: "object",
    },
  },
  type: "object",
};

/**
 * Hook that returns the agent input/output schemas.
 * - inputSchema: MessageListInput (what you pass to agent.generate())
 * - outputSchema: agent generate() trimmed output (text, object, toolCalls, etc.)
 */
export function useAgentSchema() {
  return {
    error: null as Error | null,
    inputSchema: AGENT_INPUT_SCHEMA,
    isLoading: false,
    outputSchema: AGENT_OUTPUT_SCHEMA,
  };
}
