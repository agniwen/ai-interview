import { Agent } from "@mastra/core/agent";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { mastraModels } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import { createRecruitingCopilotTools } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/tools/recruiting-copilot";
import { buildRecruitingCopilotInstructions } from "./recruiting-copilot-instructions";
import type { RecruitingCopilotFocus } from "./recruiting-copilot-instructions";

export function createRecruitingCopilotAgent({
  focus,
  organizationId,
  visibilityScope,
}: {
  focus?: RecruitingCopilotFocus;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}) {
  return new Agent({
    id: "recruiting-copilot-agent",
    instructions: buildRecruitingCopilotInstructions(focus),
    maxRetries: 1,
    model: mastraModels.fastModel,
    name: "RecruitingCopilotAgent",
    tools: createRecruitingCopilotTools({ organizationId, visibilityScope }),
  });
}
