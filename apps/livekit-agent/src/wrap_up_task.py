"""Wrap-up task: ask one closing question, then end the call.

Splitting the wrap-up phase out of InterviewAgent's main prompt addresses the
recurring failure mode where smaller LLMs ignore the "no new topics" hint and
keep asking new interview questions past the soft-wrap deadline. Inside this
task the tool surface is bounded to end_call only, so the model has nowhere
to go after the candidate finishes the closing question except to close.

The task reuses the parent InterviewAgent's EndCallTool so the actual shutdown
path is identical to a normal end-of-interview close (TTS the configured
closing instructions, then DeleteRoom + shutdown via job_ctx).
"""

import logging

from livekit.agents import AgentTask
from livekit.agents.beta.tools import EndCallTool

logger = logging.getLogger("agent")


# 任务级 system prompt: 仅约束行为, 实际告别措辞由 EndCallTool.end_instructions 注入,
# 这样自定义的 closing_instructions 能继续生效, 不会被任务提示覆盖.
# Task-level system prompt: behavioural rails only. The actual goodbye wording
# is injected via EndCallTool.end_instructions so the user-configured closing
# instructions still drive the final TTS without being clobbered here.
_WRAP_UP_INSTRUCTIONS = """你正处在面试的收尾阶段, 任务是问候选人一个简短的总结性收尾问题, 然后结束面试.

收尾问题建议方向(任选其一, 不要全部都问):
- 询问候选人对今天面试的感受, 或对我们公司/岗位还有什么想了解的
- 让候选人做一个简短的自我评价或总结
- 询问候选人是否还有任何想补充的内容

行为规则:
- 不要再提出新的技术问题、不要追问简历细节, 也不要展开新话题.
- 候选人回答收尾问题后, 或主动表示"没有了/没什么补充了"时, 立即调用 end_call 工具结束面试.
- 候选人若提出与岗位/公司相关的问题, 简短回应一两句即可, 然后随即 end_call.
- 全程使用中文, 语气友好专业, 不使用 emoji 或特殊符号."""


class WrapUpTask(AgentTask[None]):
    """Asks one closing question and ends the call via the shared EndCallTool.

    The task does not need a typed result because the only successful exit is
    the LLM calling end_call, which shuts the session down directly. Cancellation
    via the hard timeout path or candidate disconnect is handled by the parent
    session lifecycle, not by this task.
    """

    def __init__(self, end_call_tool: EndCallTool) -> None:
        super().__init__(
            instructions=_WRAP_UP_INSTRUCTIONS,
            # 仅暴露 end_call, 把模型的工具空间限制到"问完就关"这一条路径.
            # Restrict the tool surface to end_call so the LLM cannot route the
            # conversation anywhere but to the close.
            tools=end_call_tool.tools,  # type: ignore[arg-type]
        )

    async def on_enter(self) -> None:
        # 由任务自身触发收尾问句, 避免主 agent 在 on_user_turn_completed
        # 注入 hint 后还要再赌一次模型自觉性.
        # Drive the closing question from the task itself rather than relying
        # on the parent agent's hint mechanism, which leaves the trigger up
        # to the LLM's discretion.
        logger.info("wrap-up: entering closing phase")
        await self.session.generate_reply(
            instructions=(
                "现在进入面试收尾阶段. 用一句自然口语向候选人提出本场最后一个收尾性问题"
                "(例如询问感受、是否有想了解的, 或让对方做简短自我评价). "
                "不要再提技术问题、不要追问简历细节. 听完候选人回答后立即调用 end_call 结束."
            ),
        )
