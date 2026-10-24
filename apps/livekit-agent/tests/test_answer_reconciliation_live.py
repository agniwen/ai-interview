"""Explicitly opted-in checks of the transcript reconciliation prompt.

RUN_QWEN_REALTIME_TESTS=1 uv run pytest tests/test_answer_reconciliation_live.py -q
Calls the text reconciliation model with synthetic data; nothing is persisted.
"""

import os
from dataclasses import replace
from pathlib import Path

import pytest
from dotenv import load_dotenv
from test_realtime_interview_agent import context

from answer_reconciliation import extract_answers
from dispatch_context import (
    DispatchFollowUpContract,
    DispatchFollowUpFacet,
    DispatchQuestion,
)
from realtime_interview_agent import RealtimeInterviewAgent

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_QWEN_REALTIME_TESTS") != "1",
    reason="requires explicit opt-in for billable Qwen integration tests",
)

QUESTIONS = [
    {
        "question_id": "q1",
        "question": "最近两份工作的公司、岗位、团队、汇报上级、薪酬和任职时长",
        "evaluation_focus": None,
        "follow_up_intent": None,
        "coverage_mode": "sufficient_for_evaluation",
        "topics": [],
        "saved_summary": None,
    },
    {
        "question_id": "q2",
        "question": "您是否还有补充或想问的问题？",
        "evaluation_focus": None,
        "follow_up_intent": None,
        "coverage_mode": "sufficient_for_evaluation",
        "topics": [],
        "saved_summary": None,
    },
]

TURNS = [
    {"id": "a1", "role": "agent", "message": "请介绍最近两份工作。", "seconds": 1},
    {
        "id": "u1",
        "role": "user",
        "message": "最近在启明教育做高级用户运营，带两个人，月薪一万九，十四薪。",
        "seconds": 10,
    },
    {"id": "a2", "role": "agent", "message": "上一份工作呢？", "seconds": 20},
    {
        "id": "u2",
        "role": "user",
        "message": "上一份在优品汇做用户运营专员，月薪一万二，在那边做了一年半。",
        "seconds": 30,
    },
    {"id": "a3", "role": "agent", "message": "用过哪些 AI 工具？", "seconds": 40},
    {
        "id": "u3",
        "role": "user",
        "message": "主要用 ChatGPT。另外想确认一下，我前面说的任职时长你那边记下来了吗？",
        "seconds": 50,
    },
]

TURN_REASONS = (
    "上一份是公司业务收缩，团队从十二人裁到五人；再往前那份是想从电商转到教育行业。"
)

GAP_WORDS = ("尚未", "未提供", "未说明", "缺少", "未提及")


def setup_module():
    load_dotenv(Path(__file__).parents[1] / ".env")


async def test_raw_extraction_does_not_mark_unasked_supplement_skipped():
    result = await extract_answers(QUESTIONS, TURNS)
    answers = {a["question_id"]: a for a in result["answers"]}
    assert answers.get("q2", {}).get("status") != "skipped", answers


async def test_saved_summary_keeps_facts_without_gap_descriptions():
    agent = RealtimeInterviewAgent(
        replace(
            context(),
            questions=(
                DispatchQuestion("q1", QUESTIONS[0]["question"], "easy", None, None),
                DispatchQuestion("q2", QUESTIONS[1]["question"], "easy", None, None),
            ),
        ),
        answer_extractor=extract_answers,
    )
    await agent.set_active_topics(question_ids=["q1"])
    for turn in TURNS:
        agent.observe_turn(turn["id"], turn["role"], turn["message"], turn["seconds"])
    await agent.reconcile_answers()
    state = await agent.get_interview_state()
    work, supplement = state["questions"]
    assert "一年半" in work["answer_summary"] or "1年半" in work["answer_summary"]
    assert not any(word in work["answer_summary"] for word in GAP_WORDS), work
    # Volunteered cross-question facts may open an item, but an unasked item
    # must never count as handled.
    assert supplement["status"] in ("unasked", "in_progress"), supplement
    assert "q2" in state["remaining_question_ids"]


def question(
    question_id, text, topics=(), mode="sufficient_for_evaluation", saved=None
):
    return {
        "question_id": question_id,
        "question": text,
        "evaluation_focus": None,
        "follow_up_intent": None,
        "coverage_mode": mode,
        "topics": list(topics),
        "saved_summary": saved,
    }


def turn(turn_id, role, message):
    return {"id": turn_id, "role": role, "message": message, "seconds": 0}


async def test_vague_reply_is_not_an_answer():
    result = await extract_answers(
        [question("q1", "目前看机会的核心关注点或求职动机")],
        [
            turn("a1", "agent", "方便聊聊您看机会的核心关注点吗？"),
            turn("u1", "user", "嗯，随便吧，就那样。"),
        ],
    )
    statuses = {a["question_id"]: a["status"] for a in result["answers"]}
    assert statuses.get("q1") != "answered", result
    assert "q1" in result["asked_question_ids"], result


async def test_recognition_errors_do_not_override_the_saved_wording():
    result = await extract_answers(
        [
            question(
                "q1",
                "最近工作的岗位、团队、汇报上级",
                saved="星辰科技用户运营主管，带4人，汇报给COO",
            )
        ],
        [
            turn("a1", "agent", "介绍下最近这份工作？"),
            turn("u1", "user", "我在星辰科技做用户运营主管，我带4个，汇报给ceo。"),
        ],
    )
    summary = result["answers"][0]["answer_summary"]
    assert "COO" in summary and "CEO" not in summary.upper().replace("COO", ""), summary


async def test_evaluative_topic_is_judged_instead_of_left_missing():
    result = await extract_answers(
        [
            question(
                "q1",
                "最近两份工作的离职原因",
                topics=("上份工作离职原因", "上上份工作离职原因", "风险高频词标记"),
                mode="all_required",
            )
        ],
        [
            turn("a1", "agent", "最近两份工作的离职原因分别是什么？"),
            turn("u1", "user", TURN_REASONS),
        ],
    )
    agent = RealtimeInterviewAgent(
        replace(
            context(),
            questions=(
                DispatchQuestion(
                    "q1",
                    "最近两份工作的离职原因",
                    "easy",
                    None,
                    None,
                    DispatchFollowUpContract(
                        "all_required",
                        tuple(
                            DispatchFollowUpFacet(str(i), label)
                            for i, label in enumerate(
                                (
                                    "上份工作离职原因",
                                    "上上份工作离职原因",
                                    "风险高频词标记",
                                )
                            )
                        ),
                    ),
                ),
            ),
        ),
        answer_extractor=lambda questions, turns: extract_answers(questions, turns),
    )
    await agent.set_active_topics(question_ids=["q1"])
    agent.observe_turn("a1", "agent", "最近两份工作的离职原因分别是什么？", 0)
    agent.observe_turn("u1", "user", TURN_REASONS, 1)
    await agent.reconcile_answers()
    assert result["answers"], result
    assert (await agent.get_interview_state())["questions"][0]["status"] == "answered"


async def test_refusing_one_topic_does_not_skip_the_whole_question():
    result = await extract_answers(
        [
            question(
                "q1",
                "最近工作的岗位、团队、汇报上级和薪资",
                topics=("岗位及团队情况", "汇报上级职位", "具体月薪"),
                mode="all_required",
            )
        ],
        [
            turn("a1", "agent", "最近这份工作的岗位、团队和薪资是怎样的？"),
            turn("u1", "user", "薪资这个我不太方便透露，跳过吧。"),
        ],
    )
    statuses = {a["question_id"]: a["status"] for a in result["answers"]}
    assert statuses.get("q1") != "skipped", result


async def test_a_topic_settled_by_stated_numbers_counts_as_covered():
    question = {
        **QUESTIONS[0],
        "question": "最近一份工作的薪酬结构及具体月薪、年薪",
        "coverage_mode": "all_required",
        "topics": ["具体月薪", "具体年薪"],
    }
    result = await extract_answers(
        [question],
        [
            {
                "id": "a1",
                "role": "agent",
                "message": "这份工作薪酬怎样？",
                "seconds": 1,
            },
            {
                "id": "u1",
                "role": "user",
                "message": "月薪两万一，十三薪，没有别的奖金。",
                "seconds": 5,
            },
        ],
    )
    answer = next(a for a in result["answers"] if a["question_id"] == "q1")
    assert {"具体月薪", "具体年薪"} <= set(answer["covered_topics"]), answer
