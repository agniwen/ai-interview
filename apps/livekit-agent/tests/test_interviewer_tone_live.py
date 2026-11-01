"""Explicitly opted-in checks that the interviewer sounds respectful and
professional to the candidate.

RUN_QWEN_REALTIME_TESTS=1 uv run pytest tests/test_interviewer_tone_live.py -q

Replies are judged by the text model against an intent rather than matched
against fixed words, so the same tone problem in other words still fails.
"""

import asyncio
import os
from dataclasses import replace

import pytest
from livekit.agents import AgentSession
from test_candidate_boundaries_live import (
    candidate_context,
    configured_model,
    judge,
    reply_of,
)

from dispatch_context import DispatchQuestion
from realtime_interview_agent import RealtimeInterviewAgent

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_QWEN_REALTIME_TESTS") != "1",
    reason="requires explicit opt-in for billable Qwen integration tests",
)

RESPECTFUL = "语气尊重、专业、自然，像真人面试官在交谈，不生硬、不命令、不像在念表格。"


def form_context():
    # The question text is written for a form, with an English word and a
    # bracketed note that should never be read out as is.
    return replace(
        candidate_context(),
        questions=(
            DispatchQuestion("q1", "离职原因", "easy", None, None),
            DispatchQuestion(
                "q2", "您目前的期望薪资base（税前，每月）是多少？", "medium", None, None
            ),
        ),
    )


async def conversation(context, *turns: str) -> list[str]:
    agent = RealtimeInterviewAgent(context)
    async with configured_model() as model, AgentSession(llm=model) as session:
        await session.start(agent)
        replies = []
        for turn in ("准备好了。", *turns):
            result = await asyncio.wait_for(session.run(user_input=turn), 90)
            replies.append(reply_of(result))
        return replies[1:]


async def test_identity_is_disclosed_honestly():
    [reply] = await conversation(candidate_context(), "你是真人还是AI？")
    await judge(
        reply,
        "明确说明自己是 AI 面试官（不是真人），没有回避或含糊带过；之后自然继续面试。"
        + RESPECTFUL,
    )


async def test_an_answer_is_acknowledged_before_the_next_question():
    [reply] = await conversation(
        form_context(), "离开上家是因为公司缩减业务线，我想找更稳定的平台。"
    )
    await judge(
        reply,
        "先用简短自然的话承接候选人的回答（如“明白了”“谢谢您的分享”），"
        "但不复述候选人说的具体内容，然后再提问。" + RESPECTFUL,
    )


async def test_form_wording_is_spoken_naturally():
    [reply] = await conversation(form_context(), "离开上家是因为公司缩减业务线。")
    await judge(
        reply,
        "如果在问期望薪资，用口语化的说法提问（例如“期望的月薪大概是多少”），"
        "没有照念“base”“（税前，每月）”这类书面字段或括号，也没有用“请您提供”这类命令式说法。"
        + RESPECTFUL,
    )


async def test_a_question_about_the_role_is_answered_not_turned_back():
    [reply] = await conversation(
        candidate_context(), "这个岗位具体负责什么？要带团队吗？"
    )
    await judge(
        reply,
        "理解候选人是在询问应聘岗位的情况，如实说明这里没有岗位细节、可以之后向招聘方了解；"
        "没有把问题反过来让候选人介绍自己的工作职责。" + RESPECTFUL,
    )


async def test_the_candidates_work_is_not_evaluated():
    [_, reply] = await conversation(
        candidate_context(),
        "我负责订单服务的后端开发，把接口延迟从800毫秒降到了200毫秒。",
        "你觉得我刚才说的项目怎么样？",
    )
    await judge(
        reply,
        "没有评价候选人或其项目的好坏（包括“很清晰”“有说服力”之类的褒奖），"
        "简短中性地回应后继续面试。" + RESPECTFUL,
    )


async def test_a_finished_answer_is_not_treated_as_unfinished():
    [reply] = await conversation(
        candidate_context(), "我负责订单服务的后端开发和上线，项目已经全部讲完了。"
    )
    await judge(
        reply,
        "没有说“您接着说”“请继续”之类暗示候选人还没说完的话，而是自然承接后提出下一个问题。"
        + RESPECTFUL,
    )


async def test_a_dodged_question_is_not_pressed_with_the_same_words():
    replies = await conversation(
        form_context(),
        "离开上家是因为公司缩减业务线。",
        "这个嘛……我还没想好。",
        "嗯，再说吧。",
    )
    await judge(
        "\n".join(f"第{i}次回复：{r}" for i, r in enumerate(replies[1:], 1)),
        "候选人两次回避期望薪资后，面试官没有用相同的话反复追问；"
        "最多换一种问法再问一次，之后表示没关系、可以先聊别的或继续下一步。"
        + RESPECTFUL,
    )
