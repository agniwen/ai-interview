"""Ready-check task: greet the candidate and wait for "I'm ready".

Splitting this single phase out of the monolithic InterviewAgent prompt
addresses the recurring failure mode where smaller LLMs (Qwen-turbo /
DeepSeek-V4-flash etc.) ignore the "do not ask interview questions yet"
rule and jump straight into the first question. Inside the task the model
sees a tightly-scoped instruction set with exactly two tools, so the
decision space is bounded.

We deliberately do NOT forward the parent agent's chat_ctx: at the opening
there is no conversation history to preserve, and the parent's system
prompt explicitly tells the model to skip greetings and dive into the
first preset question — which would directly contradict the per-call
opening_instructions and cause small models to ignore the configured
greeting wording.
"""

import logging

from livekit.agents import AgentTask, function_tool

from prompts import LANGUAGE_POLICY

logger = logging.getLogger("agent")


# 仅描述工具调用规则, 不规定问候措辞: 真正的开场话术由 generate_reply 的
# instructions 参数携带 (由 TS dispatch contract 提供最终 opening prompt),
# 这样自定义提示词不会被任务级 system prompt 覆盖.
# Tool-routing rules only; the greeting wording itself comes from the
# versioned dispatch contract and is passed as per-call generate_reply
# instructions, so it is not overridden by the task-level prompt.
_TASK_INSTRUCTIONS = f"""你正处在面试的开场阶段, 任务是与候选人完成开场对话, 并通过工具调用判断候选人是否已准备好开始面试.

工具调用规则:
- 候选人明确表示已准备好(例如"好""准备好了""可以开始""开始吧""yes""I'm ready""let's start"), 立即调用 confirm_ready 工具.
- 候选人表示需要更多时间(例如"稍等""再给我一分钟""one moment""give me a minute"), 礼貌等候并自然地再次确认; 不要在此阶段提出任何面试题、不要追问候选人的个人或技术细节.
- 候选人明确表示不愿参加、要求结束本次面试, 或态度恶劣经提醒仍不端正, 调用 decline_interview 工具.

语言规则:
- {LANGUAGE_POLICY}
- 语气友好专业, 不使用 emoji 或特殊符号."""


class ReadyCheckTask(AgentTask[bool]):
    """Greets the candidate and returns True once they confirm they are ready.

    Returns False if the candidate explicitly declines the interview so the
    parent agent can wrap up gracefully instead of probing further.
    """

    def __init__(self, opening_instructions: str) -> None:
        super().__init__(instructions=_TASK_INSTRUCTIONS)
        self._opening_instructions = opening_instructions

    async def on_enter(self) -> None:
        # 用户配置的开场白 (含 {候选人姓名} / {岗位} 占位替换) 作为本次回复的指令,
        # 让模型严格按照管理后台配置的措辞进行问候.
        # The configured opening (with {候选人姓名}/{岗位} substituted) is
        # passed as the per-call directive so the model follows the exact
        # wording from the admin console.
        await self.session.generate_reply(instructions=self._opening_instructions)

    @function_tool
    async def confirm_ready(self) -> None:
        """候选人已明确表示准备好开始面试时调用。"""
        logger.info("ready check: candidate confirmed ready")
        self.complete(True)

    @function_tool
    async def decline_interview(self) -> None:
        """候选人明确表示不愿参加、要求结束本次面试, 或态度恶劣经提醒仍不端正时调用。"""
        logger.info("ready check: candidate declined")
        self.complete(False)
