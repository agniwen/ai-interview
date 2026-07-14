import type { JSONSchema7 } from "json-schema";

/**
 * JSON Schema for MastraDBMessage
 */
const CONTENT_SCHEMA: JSONSchema7 = {
  anyOf: [
    { type: "string" },
    {
      description: "Structured content (format 2 with parts)",
      type: "object",
    },
    {
      description: "Content parts array",
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
      description: "User input messages (MastraDBMessage[])",
      items: MESSAGE_SCHEMA,
      type: "array",
    },
    rememberedMessages: {
      description: "Messages from memory (MastraDBMessage[])",
      items: MESSAGE_SCHEMA,
      type: "array",
    },
    systemMessages: {
      description: "System messages (CoreMessage[])",
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
      description: "Tagged system messages (Record<string, CoreSystemMessage[]>)",
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
  description: "Scorer input for agent-type scorers (scoringInputSchema)",
  properties: {
    additionalContext: {
      additionalProperties: true,
      description: "Additional context (optional)",
      type: "object",
    },
    input: SCORER_RUN_INPUT_FOR_AGENT,
    output: SCORER_RUN_OUTPUT_FOR_AGENT,
    requestContext: {
      additionalProperties: true,
      description: "Request context (optional)",
      type: "object",
    },
    runId: {
      description: "Run ID (optional)",
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
  description: "Scorer input for custom scorers (scoringInputSchema)",
  properties: {
    additionalContext: {
      additionalProperties: true,
      description: "Additional context (optional)",
      type: "object",
    },
    input: {
      description: "Input to the entity being scored (any)",
    },
    output: {
      description: "Output from the entity being scored (any)",
    },
    requestContext: {
      additionalProperties: true,
      description: "Request context (optional)",
      type: "object",
    },
    runId: {
      description: "Run ID (optional)",
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
  description: "Scorer ground truth (any shape)",
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
