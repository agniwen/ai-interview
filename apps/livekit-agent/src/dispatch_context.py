from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

SCHEMA_VERSION = 2

_CONTRACT_ROOT_KEYS = {
    "candidate",
    "prompts",
    "questions",
    "recording",
    "schemaVersion",
    "selectedInterviewer",
    "session",
}


class DispatchContextError(ValueError):
    """Participant metadata does not match the interview dispatch contract."""


@dataclass(frozen=True)
class DispatchSession:
    allow_text_input: bool
    interview_record_id: str
    round_id: str


@dataclass(frozen=True)
class DispatchCandidate:
    name: str
    target_role: str


@dataclass(frozen=True)
class DispatchRecording:
    enabled: bool
    file_key: str | None


@dataclass(frozen=True)
class DispatchInterviewer:
    name: str
    voice: str | None


@dataclass(frozen=True)
class DispatchPrompts:
    system: str
    opening: str
    closing: str


@dataclass(frozen=True)
class DispatchQuestion:
    id: str
    content: str
    difficulty: str
    evaluation_focus: str | None
    follow_up_directions: str | None


@dataclass(frozen=True)
class InterviewDispatchContext:
    schema_version: int
    session: DispatchSession
    candidate: DispatchCandidate
    recording: DispatchRecording
    selected_interviewer: DispatchInterviewer | None
    prompts: DispatchPrompts
    questions: tuple[DispatchQuestion, ...]


def _object(value: Any, path: str, keys: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DispatchContextError(f"{path} must be an object")
    actual_keys = set(value)
    if actual_keys != keys:
        raise DispatchContextError(f"{path} has invalid fields")
    return value


def _dispatch_root(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DispatchContextError("metadata must be an object")
    actual_keys = set(value)
    if not _CONTRACT_ROOT_KEYS.issubset(actual_keys):
        raise DispatchContextError("metadata has missing fields")
    if actual_keys != _CONTRACT_ROOT_KEYS:
        raise DispatchContextError("metadata has invalid fields")
    return value


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DispatchContextError(f"{path} must be a non-empty string")
    return value


def _nullable_string(value: Any, path: str) -> str | None:
    if value is None:
        return None
    return _string(value, path)


def _boolean(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise DispatchContextError(f"{path} must be a boolean")
    return value


def _questions(value: Any) -> tuple[DispatchQuestion, ...]:
    if not isinstance(value, list) or not value:
        raise DispatchContextError("questions must contain at least one question")
    questions: list[DispatchQuestion] = []
    for index, raw_question in enumerate(value):
        path = f"questions[{index}]"
        question = _object(
            raw_question,
            path,
            {
                "content",
                "difficulty",
                "evaluationFocus",
                "followUpDirections",
                "id",
            },
        )
        difficulty = _string(question["difficulty"], f"{path}.difficulty")
        if difficulty not in {"easy", "medium", "hard"}:
            raise DispatchContextError(f"{path}.difficulty is invalid")
        questions.append(
            DispatchQuestion(
                id=_string(question["id"], f"{path}.id"),
                content=_string(question["content"], f"{path}.content"),
                difficulty=difficulty,
                evaluation_focus=_nullable_string(
                    question["evaluationFocus"], f"{path}.evaluationFocus"
                ),
                follow_up_directions=_nullable_string(
                    question["followUpDirections"], f"{path}.followUpDirections"
                ),
            )
        )
    return tuple(questions)


def parse_dispatch_context(raw_metadata: str) -> InterviewDispatchContext:
    try:
        decoded = json.loads(raw_metadata)
    except (json.JSONDecodeError, TypeError) as error:
        raise DispatchContextError("participant metadata must be valid JSON") from error

    root = _dispatch_root(decoded)
    schema_version = root["schemaVersion"]
    if type(schema_version) is not int or schema_version != SCHEMA_VERSION:
        raise DispatchContextError("unsupported schemaVersion")

    session = _object(
        root["session"],
        "session",
        {"allowTextInput", "interviewRecordId", "roundId"},
    )
    candidate = _object(root["candidate"], "candidate", {"name", "targetRole"})
    recording = _object(root["recording"], "recording", {"enabled", "fileKey"})
    prompts = _object(root["prompts"], "prompts", {"closing", "opening", "system"})

    recording_enabled = _boolean(recording["enabled"], "recording.enabled")
    recording_file_key = _nullable_string(recording["fileKey"], "recording.fileKey")
    if recording_enabled and recording_file_key is None:
        raise DispatchContextError(
            "recording.fileKey is required when recording is enabled"
        )

    selected_interviewer_raw = root["selectedInterviewer"]
    selected_interviewer = None
    if selected_interviewer_raw is not None:
        interviewer = _object(
            selected_interviewer_raw,
            "selectedInterviewer",
            {"name", "voice"},
        )
        selected_interviewer = DispatchInterviewer(
            name=_string(interviewer["name"], "selectedInterviewer.name"),
            voice=_nullable_string(interviewer["voice"], "selectedInterviewer.voice"),
        )

    return InterviewDispatchContext(
        schema_version=schema_version,
        session=DispatchSession(
            allow_text_input=_boolean(
                session["allowTextInput"], "session.allowTextInput"
            ),
            interview_record_id=_string(
                session["interviewRecordId"], "session.interviewRecordId"
            ),
            round_id=_string(session["roundId"], "session.roundId"),
        ),
        candidate=DispatchCandidate(
            name=_string(candidate["name"], "candidate.name"),
            target_role=_string(candidate["targetRole"], "candidate.targetRole"),
        ),
        recording=DispatchRecording(
            enabled=recording_enabled,
            file_key=recording_file_key,
        ),
        selected_interviewer=selected_interviewer,
        prompts=DispatchPrompts(
            system=_string(prompts["system"], "prompts.system"),
            opening=_string(prompts["opening"], "prompts.opening"),
            closing=_string(prompts["closing"], "prompts.closing"),
        ),
        questions=_questions(root["questions"]),
    )
