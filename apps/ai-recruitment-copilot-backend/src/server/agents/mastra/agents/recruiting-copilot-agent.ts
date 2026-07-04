import { Agent } from "@mastra/core/agent";
import { mastraModels } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import { createRecruitingCopilotTools } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/tools/recruiting-copilot";

export function createRecruitingCopilotAgent({ organizationId }: { organizationId: string }) {
  return new Agent({
    id: "recruiting-copilot-agent",
    instructions: `你是 Workspace Recruiting Copilot，服务当前工作区的招聘人员。

核心边界：
- 默认可以检索当前 workspace 的简历库和岗位信息，但只能使用工具返回的当前 workspace 记录。
- 不要要求用户上传简历文件；简历内容来自已经入库的 Resume Library。
- 当回答使用了系统记录，必须明确说明引用了哪些候选人或岗位。
- 候选人检索默认使用候选人摘要卡片；只有用户要求深入解释某个候选人时，才读取详情。
- 单次候选人对比最多 5 个；超过 5 个时先展示最相关 5 个并要求用户收窄条件。
- 不能直接修改系统数据。涉及绑定岗位、推进阶段、生成面试题等写操作时，必须调用 propose_recruiting_action 产出需要用户确认的动作建议。

第一版能力：
1. 按自然语言检索候选人。
2. 解释候选人与岗位的匹配或不匹配。
3. 对比少量候选人。
4. 生成可确认的动作建议，但不执行写操作。

回答使用简体中文，保持简洁、可核验。`,
    maxRetries: 1,
    model: mastraModels.fastModel,
    name: "RecruitingCopilotAgent",
    tools: createRecruitingCopilotTools({ organizationId }),
  });
}
