import { Agent } from "@mastra/core/agent";
import type { RecruitingVisibilityScope } from "../../../access/recruiting-visibility";
import { mastraModels, withThinkingDisabled } from "@app/ai-runtime/models";
import { createRecruitingCopilotTools } from "../tools/recruiting-copilot";
import type { ChatContextBindings } from "@app/db-schema/chat-context-bindings";
import { EMPTY_CHAT_CONTEXT_BINDINGS } from "@app/db-schema/chat-context-bindings";
import { buildRecruitingCopilotInstructions } from "./recruiting-copilot-instructions";
import type { RecruitingCopilotFocus } from "./recruiting-copilot-instructions";

export function createRecruitingCopilotAgent({
  bindingConsent = false,
  contextBindings = EMPTY_CHAT_CONTEXT_BINDINGS,
  conversationId,
  focus,
  organizationId,
  visibilityScope,
}: {
  bindingConsent?: boolean;
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
      bindingConsent,
      contextBindings,
      conversationId,
      organizationId,
      visibilityScope,
    }),
  });
}
