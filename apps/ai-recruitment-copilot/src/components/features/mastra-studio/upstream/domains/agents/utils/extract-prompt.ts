import type { AgentInstructions } from "@mastra/core/agent";

const resolveInstructionPart = (part: unknown) => {
  if (typeof part === "string") {
    return part.trim();
  }
  if (
    typeof part === "object" &&
    part !== null &&
    "text" in part &&
    typeof part.text === "string"
  ) {
    return part.text.trim();
  }
  return "";
};

export const extractPrompt = (instructions?: AgentInstructions): string => {
  if (typeof instructions === "string") {
    return instructions.trim();
  }

  if (typeof instructions === "object" && "content" in instructions) {
    if (Array.isArray(instructions.content)) {
      return instructions.content.map(resolveInstructionPart).join("\n\n").trim();
    }

    return instructions.content.trim();
  }

  if (Array.isArray(instructions)) {
    return instructions.map(extractPrompt).join("\n\n").trim();
  }

  return "";
};
