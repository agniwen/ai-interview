import { v4 as uuid } from "@lukeed/uuid";
import type { RuleGroup, RuleGroupDepth1, RuleGroupDepth2 } from "@mastra/core/storage";
import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import { z } from "zod";

export interface InMemoryFileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  content?: string;
  children?: InMemoryFileNode[];
}

export interface SkillFormValue {
  localId: string;
  name: string;
  description: string;
  workspaceId: string;
  files: InMemoryFileNode[];
}

export interface InlineInstructionBlock {
  id: string;
  type: "prompt_block";
  content: string;
  rules?: RuleGroup;
}

export interface RefInstructionBlock {
  id: string;
  type: "prompt_block_ref";
  promptBlockId: string;
}

export type InstructionBlock = InlineInstructionBlock | RefInstructionBlock;

const ruleSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "greater_than",
    "less_than",
    "greater_than_or_equal",
    "less_than_or_equal",
    "in",
    "not_in",
    "exists",
    "not_exists",
  ]),
  value: z.unknown().optional(),
});

const ruleGroupDepth2Schema: z.ZodType<RuleGroupDepth2> = z.object({
  conditions: z.array(ruleSchema),
  operator: z.enum(["AND", "OR"]),
});

const ruleGroupDepth1Schema: z.ZodType<RuleGroupDepth1> = z.object({
  conditions: z.array(z.union([ruleSchema, ruleGroupDepth2Schema])),
  operator: z.enum(["AND", "OR"]),
});

const ruleGroupSchema: z.ZodType<RuleGroup> = z.object({
  conditions: z.array(z.union([ruleSchema, ruleGroupDepth1Schema])),
  operator: z.enum(["AND", "OR"]),
});

const inlineInstructionBlockSchema = z.object({
  content: z.string(),
  id: z.string(),
  rules: ruleGroupSchema.optional(),
  type: z.literal("prompt_block"),
});

const refInstructionBlockSchema = z.object({
  id: z.string(),
  promptBlockId: z.string().min(1),
  type: z.literal("prompt_block_ref"),
});

const instructionBlockSchema = z.discriminatedUnion("type", [
  inlineInstructionBlockSchema,
  refInstructionBlockSchema,
]);

export const createInstructionBlock = (
  content = "",
  rules?: RuleGroup,
): InlineInstructionBlock => ({
  content,
  id: uuid(),
  rules,
  type: "prompt_block",
});

export const createRefInstructionBlock = (promptBlockId: string): RefInstructionBlock => ({
  id: uuid(),
  promptBlockId,
  type: "prompt_block_ref",
});

const scoringSamplingConfigSchema = z.object({
  rate: z.number().optional(),
  type: z.enum(["ratio"]),
});

const entityConfigSchema = z.object({
  description: z.string().max(500).optional(),
  rules: ruleGroupSchema.optional(),
});

const skillConfigSchema = z.object({
  description: z.string().optional(),
  instructions: z.string().optional(),
  pin: z.string().optional(),
  strategy: z.enum(["latest", "live"]).optional(),
});

const scorerConfigSchema = z.object({
  description: z.string().max(500).optional(),
  rules: ruleGroupSchema.optional(),
  sampling: scoringSamplingConfigSchema.optional(),
});

const memoryConfigSchema = z
  .object({
    embedder: z.string().optional(),
    enabled: z.boolean().optional(),
    lastMessages: z.union([z.number().min(1), z.literal(false)]).optional(),
    observationalMemory: z
      .object({
        enabled: z.boolean().optional(),
        model: z
          .object({
            name: z.string().optional(),
            provider: z.string().optional(),
          })
          .optional(),
        observation: z
          .object({
            blockAfter: z.number().min(0).optional(),
            bufferActivation: z.number().min(0).max(1).optional(),
            bufferTokens: z.union([z.number().min(0), z.literal(false)]).optional(),
            maxTokensPerBatch: z.number().min(1).optional(),
            messageTokens: z.number().min(1).optional(),
            model: z
              .object({
                name: z.string().optional(),
                provider: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        reflection: z
          .object({
            blockAfter: z.number().min(0).optional(),
            bufferActivation: z.number().min(0).max(1).optional(),
            model: z
              .object({
                name: z.string().optional(),
                provider: z.string().optional(),
              })
              .optional(),
            observationTokens: z.number().min(1).optional(),
          })
          .optional(),
        scope: z.enum(["resource", "thread"]).optional(),
        shareTokenBudget: z.boolean().optional(),
      })
      .optional(),
    readOnly: z.boolean().optional(),
    semanticRecall: z.boolean().optional(),
    vector: z.string().optional(),
  })
  .refine(
    (data) => {
      // If semanticRecall is enabled, vector and embedder are required
      if (data.semanticRecall && data.enabled) {
        return !!data.vector && !!data.embedder;
      }
      return true;
    },
    {
      message: "Semantic recall requires both vector and embedder to be configured",
      path: ["semanticRecall"],
    },
  );

const inMemoryFileNodeSchema: z.ZodType<InMemoryFileNode> = z.lazy(() =>
  z.object({
    children: z.array(inMemoryFileNodeSchema).optional(),
    content: z.string().optional(),
    id: z.string(),
    name: z.string(),
    type: z.enum(["file", "folder"]),
  }),
);

export const agentFormSchema = z.object({
  agents: z.record(z.string(), entityConfigSchema).optional(),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  instructionBlocks: z.array(instructionBlockSchema).optional(),
  instructions: z.string().min(1, "Instructions are required"),
  integrationTools: z.record(z.string(), entityConfigSchema).optional(),
  mcpClients: z
    .array(
      z.object({
        description: z.string().optional(),
        id: z.string().optional(),
        name: z.string().min(1),
        selectedTools: z
          .record(
            z.string(),
            z.object({
              description: z.string().optional(),
            }),
          )
          .optional()
          .default({}),
        servers: z.record(z.string(), z.any()),
      }),
    )
    .optional()
    .default([]),
  mcpClientsToDelete: z.array(z.string()).optional().default([]),
  memory: memoryConfigSchema.optional(),
  model: z.object({
    name: z.string().min(1, "Model is required"),
    provider: z.string().min(1, "Provider is required"),
  }),
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  scorers: z.record(z.string(), scorerConfigSchema).optional(),
  skills: z.record(z.string(), skillConfigSchema).optional().default({}),
  tools: z.record(z.string(), entityConfigSchema).optional(),
  variables: z.custom<JsonSchema>().optional(),
  workflows: z.record(z.string(), entityConfigSchema).optional(),
  workspace: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("id"), workspaceId: z.string() }),
      z.object({ config: z.record(z.string(), z.unknown()), type: z.literal("inline") }),
    ])
    .optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
export type EntityConfig = z.infer<typeof entityConfigSchema>;
export type ScorerConfig = z.infer<typeof scorerConfigSchema>;
export type SkillConfig = z.infer<typeof skillConfigSchema>;
