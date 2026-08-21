import { Agent } from "@mastra/core/agent";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  mastraModels,
  withThinkingDisabled,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import { createRecruitingCopilotTools } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/tools/recruiting-copilot";
import type { ChatContextBindings } from "@arc/db-schema/chat-context-bindings";
import { EMPTY_CHAT_CONTEXT_BINDINGS } from "@arc/db-schema/chat-context-bindings";
import { buildRecruitingCopilotInstructions } from "./recruiting-copilot-instructions";
import type { RecruitingCopilotFocus } from "./recruiting-copilot-instructions";

export function createRecruitingCopilotAgent({
  contextBindings = EMPTY_CHAT_CONTEXT_BINDINGS,
  conversationId,
  focus,
  organizationId,
  visibilityScope,
}: {
  contextBindings?: ChatContextBindings;
  conversationId?: string | null;
  focus?: RecruitingCopilotFocus;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}) {
  return new Agent({
    id: "recruiting-copilot-agent",
    instructions: buildRecruitingCopilotInstructions(focus),
    maxRetries: 1,
    model: withThinkingDisabled(mastraModels.fastModel),
    name: "RecruitingCopilotAgent",
    tools: createRecruitingCopilotTools({
      contextBindings,
      conversationId,
      organizationId,
      visibilityScope,
    }),
  });
}
