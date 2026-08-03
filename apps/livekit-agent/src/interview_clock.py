from __future__ import annotations

import time
from collections.abc import Callable
from enum import StrEnum


class InterviewTimelinePhase(StrEnum):
    QUESTIONS = "questions"
    FINISH_CURRENT = "finish_current"
    WRAP_UP = "wrap_up"
    CLOSE = "close"
    KILL = "kill"


# Active-time timeline (reconnect pauses excluded):
# 30:00 soft reminder / stop starting new required questions
# 33:00 finish the current question and enter wrap-up pressure
# 35:00 force closing goodbye and end the call
# 36:00 stuck-session kill if shutdown did not complete
STOP_NEW_QUESTIONS_SECONDS = 30 * 60
END_CURRENT_QUESTION_SECONDS = 33 * 60
CLOSE_SECONDS = 35 * 60
KILL_SECONDS = 36 * 60


def classify_timeline_phase(elapsed: float) -> InterviewTimelinePhase:
    if elapsed >= KILL_SECONDS:
        return InterviewTimelinePhase.KILL
    if elapsed >= CLOSE_SECONDS:
        return InterviewTimelinePhase.CLOSE
    if elapsed >= END_CURRENT_QUESTION_SECONDS:
        return InterviewTimelinePhase.WRAP_UP
    if elapsed >= STOP_NEW_QUESTIONS_SECONDS:
        return InterviewTimelinePhase.FINISH_CURRENT
    return InterviewTimelinePhase.QUESTIONS


class PausableInterviewClock:
    def __init__(
        self,
        *,
        now: Callable[[], float] = time.monotonic,
        reconnect_pause_limit: float = 5 * 60,
    ) -> None:
        self._now = now
        self._started_at = now()
        self._paused_at: float | None = None
        self._completed_pause = 0.0
        self._reconnect_pause_limit = reconnect_pause_limit

    @property
    def is_paused(self) -> bool:
        return self._paused_at is not None

    def elapsed(self) -> float:
        current = self._paused_at if self._paused_at is not None else self._now()
        return max(0.0, current - self._started_at - self._completed_pause)

    @property
    def reconnect_pause_used(self) -> float:
        current_pause = (
            max(0.0, self._now() - self._paused_at)
            if self._paused_at is not None
            else 0.0
        )
        return min(
            self._reconnect_pause_limit,
            self._completed_pause + current_pause,
        )

    @property
    def reconnect_pause_remaining(self) -> float:
        return max(0.0, self._reconnect_pause_limit - self.reconnect_pause_used)

    @property
    def can_start_reconnect_pause(self) -> bool:
        return self.reconnect_pause_remaining > 0.0

    def pause_for_reconnect(self) -> None:
        if self._paused_at is not None:
            return
        if not self.can_start_reconnect_pause:
            raise RuntimeError("reconnect pause budget exhausted")
        self._paused_at = self._now()

    def resume_from_reconnect(self) -> None:
        if self._paused_at is None:
            return
        pause_duration = max(0.0, self._now() - self._paused_at)
        self._completed_pause = min(
            self._reconnect_pause_limit,
            self._completed_pause + pause_duration,
        )
        self._paused_at = None
