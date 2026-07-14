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
    { description: "Simple text message", type: "string" },
    {
      description: "Array of text messages",
      items: { type: "string" },
      type: "array",
    },
    {
      ...messageObjectSchema,
      description: "Single message object",
    },
    {
      description: "Array of message objects",
      items: messageObjectSchema,
      type: "array",
    },
  ],
  description: "Agent message input (MessageListInput)",
};

/**
 * JSON Schema for agent output — matches the experiment executor's trimmedOutput shape.
 * All properties optional so partial ground truth (e.g. just text) is valid.
 */
const AGENT_OUTPUT_SCHEMA: JSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  description: "Agent generate() output",
  properties: {
    files: {
      description: "Files generated",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    object: { description: "Structured output (if any)" },
    reasoningText: { description: "Reasoning text (if any)", type: "string" },
    sources: {
      description: "Sources referenced",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    text: { description: "Text response", type: "string" },
    toolCalls: {
      description: "Tool calls made by the agent",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    toolResults: {
      description: "Tool execution results",
      items: { additionalProperties: true, type: "object" },
      type: "array",
    },
    usage: {
      description: "Token usage",
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
