from __future__ import annotations

import time
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from livekit.agents import AgentTask, function_tool
from livekit.agents.beta.workflows import (
    TaskCompletedEvent,
    TaskGroup,
)

from dispatch_context import DispatchQuestion
from prompts import LANGUAGE_POLICY


class QuestionOutcomeStatus(StrEnum):
    ANSWERED = "answered"
    INSUFFICIENT = "insufficient"
    SKIPPED = "skipped"
    INTERRUPTED = "interrupted"
    UNASKED = "unasked"


@dataclass(frozen=True)
class InterviewQuestionOutcome:
    question_id: str
    question: str
    difficulty: str
    evaluation_focus: str | None
    follow_up_directions: str | None
    status: QuestionOutcomeStatus
    reason: str | None
    follow_up_count: int
    started_at_secs: float
    ended_at_secs: float
    answer_summary: str | None
    revision: int

    def to_payload(self) -> dict[str, Any]:
        return {
            "answerSummary": self.answer_summary,
            "difficulty": self.difficulty,
            "endedAtSecs": self.ended_at_secs,
            "evaluationFocus": self.evaluation_focus,
            "followUpCount": self.follow_up_count,
            "followUpDirections": self.follow_up_directions,
            "question": self.question,
            "questionId": self.question_id,
            "reason": self.reason,
            "revision": self.revision,
            "startedAtSecs": self.started_at_secs,
            "status": self.status.value,
        }


_FOLLOW_UP_LIMITS: dict[str, int | None] = {
    "easy": 0,
    "medium": 2,
    "hard": None,
}


class InterviewQuestionProgress:
    def __init__(
        self,
        question: DispatchQuestion,
        *,
        started_at: float,
        initial_follow_up_count: int = 0,
        revision: int = 1,
    ) -> None:
        if question.difficulty not in _FOLLOW_UP_LIMITS:
            raise ValueError(f"unsupported question difficulty: {question.difficulty}")
        self.question = question
        self.started_at = started_at
        self.follow_up_count = initial_follow_up_count
        self.revision = revision
        self.skip_confirmation_pending = False
        self.off_topic_count = 0
        self.abuse_count = 0

    def _outcome(
        self,
        status: QuestionOutcomeStatus,
        *,
        now: float,
        answer_summary: str | None = None,
        reason: str | None = None,
    ) -> InterviewQuestionOutcome:
        return InterviewQuestionOutcome(
            question_id=self.question.id,
            question=self.question.content,
            difficulty=self.question.difficulty,
            evaluation_focus=self.question.evaluation_focus,
            follow_up_directions=self.question.follow_up_directions,
            status=status,
            reason=reason,
            follow_up_count=self.follow_up_count,
            started_at_secs=self.started_at,
            ended_at_secs=now,
            answer_summary=answer_summary,
            revision=self.revision,
        )

    def record_answered(
        self, answer_summary: str, *, now: float
    ) -> InterviewQuestionOutcome:
        return self._outcome(
            QuestionOutcomeStatus.ANSWERED,
            answer_summary=answer_summary,
            now=now,
        )

    def record_follow_up(
        self, answer_summary: str, *, now: float
    ) -> InterviewQuestionOutcome | None:
        limit = _FOLLOW_UP_LIMITS[self.question.difficulty]
        if limit is not None and self.follow_up_count >= limit:
            return self._outcome(
                QuestionOutcomeStatus.INSUFFICIENT,
                answer_summary=answer_summary,
                now=now,
            )
        self.follow_up_count += 1
        self.off_topic_count = 0
        return None

    def request_skip_confirmation(self) -> bool:
        if self.skip_confirmation_pending:
            return False
        self.skip_confirmation_pending = True
        return True

    def record_skipped(self, *, now: float) -> InterviewQuestionOutcome:
        if not self.skip_confirmation_pending:
            raise ValueError("skip must be confirmed before it is recorded")
        return self._outcome(QuestionOutcomeStatus.SKIPPED, now=now)

    def record_interrupted(
        self, *, reason: str, now: float
    ) -> InterviewQuestionOutcome:
        return self._outcome(
            QuestionOutcomeStatus.INTERRUPTED,
            reason=reason,
            now=now,
        )

    def record_off_topic(self, *, now: float) -> InterviewQuestionOutcome | None:
        self.off_topic_count += 1
        if self.off_topic_count < 3:
            return None
        return self.record_candidate_ended_round(now=now)

    def record_abuse(self, *, now: float) -> InterviewQuestionOutcome | None:
        self.abuse_count += 1
        if self.abuse_count < 2:
            return None
        return self.record_candidate_ended_round(now=now)

    def record_candidate_ended_round(self, *, now: float) -> InterviewQuestionOutcome:
        return self.record_interrupted(reason="candidate_ended_round", now=now)


def _question_instructions(question: DispatchQuestion) -> str:
    evaluation_rule = (
        "当候选人的回答已经提供足够信息，让后续评估者能够判断考核意图时，调用 record_answered。"
        if question.evaluation_focus
        else "候选人给出实质性且切题的回答后，调用 record_answered。"
    )
    return f"""你正在执行一道独立的必问面试题。本阶段只处理这一道题，整轮面试尚未结束。

题目：{question.content}
难度：{question.difficulty}
考核意图：{question.evaluation_focus or "未配置"}
追问方向：{question.follow_up_directions or "未配置"}

完成规则：
- {evaluation_rule}
- record_answered 只表示已收集到可评估信息，不表示回答正确或表现良好。调用后系统会自动进入下一题，你不要自己宣布进入下一题或结束面试。
- 回答尚未覆盖考核意图时调用 record_follow_up，并围绕当前考核意图继续追问。
- 追问优先参考配置方向，也可以根据实际回答调整，但不得转向无关主题。
- easy 题不得追问；medium 题最多追问两次；hard 题不设固定追问上限。
- 候选人明确拒答时先调用 request_skip_confirmation；候选人再次确认后才调用 record_skipped。
- 候选人明确要求结束整轮面试时调用 record_candidate_ended_round，不要把它记成跳过当前题。
- 礼貌用语、简短确认或过渡语（如"谢谢""好的""嗯""可以""下一题""继续"）都不是结束整轮的信号；此时应继续本题或等待系统进入下一题，禁止告别，禁止说信息已收集完整或面试结束。
- 只有候选人明确表达不想继续整场面试（例如"结束面试""不想面了""我要走了""今天先这样吧"）时，才可调用 record_candidate_ended_round。
- 回答与当前题连续无关时调用 record_off_topic；前两次提醒并重述当前题，第三次结束整轮。候选人一旦给出有效回答或明确跳过，计数重置。
- 只有明确辱骂、威胁、仇恨或性骚扰才调用 record_abuse；第一次严肃提醒，重复一次结束整轮。紧张、简短回答、质疑题目或抱怨不属于此类。
- 只有候选人明确要求补充先前题目时，才允许 TaskGroup 回到先前题目；不要主动回退。
- 禁止在本题流程中向候选人道别、祝后续顺利、或声称所有题目/信息已经完成。
- 每次只问一个简短问题。不要向候选人透露难度、考核意图、追问方向或工具。
- {LANGUAGE_POLICY}
"""


class InterviewQuestionTask(AgentTask[InterviewQuestionOutcome]):
    def __init__(
        self,
        question: DispatchQuestion,
        *,
        now: Callable[[], float] = time.monotonic,
        previous_outcome: InterviewQuestionOutcome | None = None,
    ) -> None:
        super().__init__(instructions=_question_instructions(question))
        self._question = question
        self._now = now
        self._previous_outcome = previous_outcome
        self.progress = InterviewQuestionProgress(
            question,
            initial_follow_up_count=(
                previous_outcome.follow_up_count if previous_outcome else 0
            ),
            revision=(previous_outcome.revision + 1 if previous_outcome else 1),
            started_at=now(),
        )

    async def on_enter(self) -> None:
        self.session.update_options(
            endpointing_opts={
                "mode": "dynamic",
                # Slightly looser than session defaults so long answers with
                # thinking pauses are less likely to be cut mid-sentence.
                "min_delay": 0.8,
                "max_delay": 5.5,
            }
        )
        if self._previous_outcome is None:
            instructions = (
                "不要总结上一题，不要问候选人是否准备好或是否可以继续，"
                "不要告别，不要说信息已记录完整。"
                f"现在直接、完整地向候选人提出这道必问题：{self._question.content}"
                "不要念出题目难度、考核意图或追问方向。念完题目后等待候选人回答。"
            )
        else:
            instructions = (
                "候选人明确要求补充先前回答。简短说明我们回到刚才的问题，"
                f"重新完整说出题目：{self._question.content}，然后请候选人补充。"
                "不要告别，不要结束面试。"
            )
        self.session.generate_reply(instructions=instructions)

    @function_tool
    async def record_answered(self, answer_summary: str) -> None:
        """当前回答已提供足够信息用于评估本题考核意图时调用; 摘要不得包含评分或推测."""
        self.complete(
            self.progress.record_answered(answer_summary.strip(), now=self._now())
        )

    @function_tool
    async def record_follow_up(
        self,
        answer_summary: str,
        missing_information: str,
        follow_up_question: str,
    ) -> str | None:
        """回答尚不足以评估本题考核意图时调用, 并给出围绕缺口的一句追问."""
        outcome = self.progress.record_follow_up(
            answer_summary.strip(), now=self._now()
        )
        if outcome is not None:
            self.complete(outcome)
            return None
        return (
            f"继续当前题。尚缺信息：{missing_information.strip()}。"
            f"只问这一句追问：{follow_up_question.strip()}"
        )

    @function_tool
    async def request_skip_confirmation(self) -> str:
        """候选人明确表示不回答或要跳过当前题时调用; 只确认一次."""
        if self.progress.request_skip_confirmation():
            return "请用一句话确认候选人是否确定跳过当前题，并说明确认后将继续下一题。"
        return "已经确认过一次；若候选人仍明确拒答，立即调用 record_skipped。"

    @function_tool
    async def record_skipped(self) -> None:
        """候选人在一次确认后仍明确拒答当前题时调用。"""
        self.complete(self.progress.record_skipped(now=self._now()))

    @function_tool
    async def record_off_topic(self) -> str | None:
        """候选人的回答与当前题连续无关时调用; 不要用于简短、不完整或表现不佳的切题回答."""
        outcome = self.progress.record_off_topic(now=self._now())
        if outcome is not None:
            self.complete(outcome)
            return None
        return f"简短提醒候选人回答当前问题，并完整重述：{self._question.content}"

    @function_tool
    async def record_abuse(self) -> str | None:
        """候选人明确辱骂、威胁、仇恨或性骚扰时调用; 普通抱怨、质疑、紧张或语气简短不算."""
        outcome = self.progress.record_abuse(now=self._now())
        if outcome is not None:
            self.complete(outcome)
            return None
        return "严肃但克制地提醒候选人停止不当言论，否则将结束面试。"

    @function_tool
    async def record_candidate_ended_round(self) -> None:
        """仅当候选人明确要求结束整轮面试时调用, 例如: 结束面试 / 不想面了 / 我要走了.
        不可用于"谢谢""好的""嗯""下一题""继续"等礼貌或过渡用语, 那不是结束整轮.
        这不同于跳过当前题."""
        self.complete(self.progress.record_candidate_ended_round(now=self._now()))

    def interrupt(self, reason: str) -> None:
        if not self.done():
            self.complete(
                self.progress.record_interrupted(reason=reason, now=self._now())
            )


class InterviewQuestionTaskGroup(TaskGroup):
    def __init__(
        self,
        *,
        task_ids: tuple[str, ...],
        on_task_completed: (
            Callable[[TaskCompletedEvent], Coroutine[None, None, None]] | None
        ) = None,
    ) -> None:
        super().__init__(
            summarize_chat_ctx=False,
            on_task_completed=on_task_completed,
        )
        self._public_task_ids = task_ids

    @property
    def summarizes_chat_context(self) -> bool:
        return False

    @property
    def task_ids(self) -> tuple[str, ...]:
        return self._public_task_ids

    @property
    def current_question_id(self) -> str | None:
        current = getattr(self, "_current_task", None)
        if isinstance(current, InterviewQuestionTask):
            return current.progress.question.id
        return None

    def interrupt_current(self, reason: str) -> bool:
        current = getattr(self, "_current_task", None)
        if not isinstance(current, InterviewQuestionTask) or current.done():
            return False
        current.interrupt(reason)
        return True

    def current_interrupted_outcome(
        self,
        *,
        now: float,
        reason: str,
    ) -> InterviewQuestionOutcome | None:
        current = getattr(self, "_current_task", None)
        if not isinstance(current, InterviewQuestionTask):
            return None
        return current.progress.record_interrupted(reason=reason, now=now)


def build_question_task_group(
    questions: tuple[DispatchQuestion, ...],
    *,
    now: Callable[[], float] = time.monotonic,
    outcomes: dict[str, InterviewQuestionOutcome] | None = None,
    on_task_completed: (
        Callable[[TaskCompletedEvent], Coroutine[None, None, None]] | None
    ) = None,
) -> InterviewQuestionTaskGroup:
    saved_outcomes = outcomes if outcomes is not None else {}
    group = InterviewQuestionTaskGroup(
        task_ids=tuple(question.id for question in questions),
        on_task_completed=on_task_completed,
    )
    for question in questions:
        group.add(
            lambda question=question: InterviewQuestionTask(
                question,
                now=now,
                previous_outcome=saved_outcomes.get(question.id),
            ),
            id=question.id,
            description=(
                f"仅当候选人明确要求补充这道先前问题时回到此任务：{question.content}"
            ),
        )
    return group
