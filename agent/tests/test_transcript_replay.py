"""Tests for ``transcript_replay.replay_turns_to``.

The function pushes accumulated turns to a reconnected candidate via
``stream_text`` on the LiveKit transcription topic, attributing each
turn to the correct sender_identity so the frontend buckets it as a
user vs agent transcript. We mock the local participant so we can
inspect the exact stream parameters produced.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from transcript_replay import (
    ATTR_SEGMENT_ID,
    ATTR_TRANSCRIPTION_FINAL,
    TRANSCRIPTION_TOPIC,
    replay_turns_to,
)


def _make_local_participant(stream_text_side_effect=None):
    """Build a mock local participant whose ``stream_text`` returns a writer.

    Returns ``(participant, captured_calls, writer_mock)`` where
    ``captured_calls`` is a list of the kwargs used for each invocation and
    ``writer_mock`` exposes ``write`` / ``aclose`` async mocks.
    """
    writer = AsyncMock()
    writer.write = AsyncMock()
    writer.aclose = AsyncMock()

    captured_calls: list[dict] = []

    async def _stream_text(**kwargs):
        captured_calls.append(kwargs)
        if stream_text_side_effect is not None:
            result = stream_text_side_effect(len(captured_calls) - 1)
            if isinstance(result, Exception):
                raise result
        return writer

    participant = AsyncMock()
    participant.stream_text = AsyncMock(side_effect=_stream_text)
    return participant, captured_calls, writer


@pytest.mark.asyncio
async def test_replay_no_op_on_empty_turns():
    participant, calls, writer = _make_local_participant()
    replayed = await replay_turns_to(
        participant,
        turns=[],
        target_identity="candidate-1",
        agent_identity="agent-1",
        candidate_identity="candidate-1",
    )
    assert replayed == 0
    assert calls == []
    writer.write.assert_not_awaited()


@pytest.mark.asyncio
async def test_replay_routes_user_and_agent_turns():
    participant, calls, writer = _make_local_participant()
    turns = [
        {"role": "agent", "message": "你好,我是面试官", "timeInCallSecs": 1},
        {"role": "user", "message": "你好准备好了", "timeInCallSecs": 5},
        {"role": "agent", "message": "请做一下自我介绍", "timeInCallSecs": 7},
    ]
    replayed = await replay_turns_to(
        participant,
        turns=turns,
        target_identity="candidate-abc",
        agent_identity="agent-xyz",
        candidate_identity="candidate-abc",
    )

    assert replayed == 3
    assert len(calls) == 3

    # 1st turn (agent) should be attributed to agent identity.
    assert calls[0]["topic"] == TRANSCRIPTION_TOPIC
    assert calls[0]["sender_identity"] == "agent-xyz"
    assert calls[0]["destination_identities"] == ["candidate-abc"]
    assert calls[0]["attributes"][ATTR_TRANSCRIPTION_FINAL] == "true"
    assert ATTR_SEGMENT_ID in calls[0]["attributes"]

    # 2nd turn (user) should be attributed to candidate identity so the
    # frontend's useSessionMessages buckets it as `userTranscript`.
    assert calls[1]["sender_identity"] == "candidate-abc"
    assert calls[1]["destination_identities"] == ["candidate-abc"]

    # 3rd turn (agent again).
    assert calls[2]["sender_identity"] == "agent-xyz"

    # Each turn must have a distinct segment id, otherwise the frontend
    # dedupes them into a single message bubble.
    segment_ids = {call["attributes"][ATTR_SEGMENT_ID] for call in calls}
    assert len(segment_ids) == 3

    # write/aclose called once per turn.
    assert writer.write.await_count == 3
    assert writer.aclose.await_count == 3


@pytest.mark.asyncio
async def test_replay_skips_blank_and_unknown_roles():
    participant, calls, _ = _make_local_participant()
    turns = [
        {"role": "user", "message": "  ", "timeInCallSecs": 1},  # blank
        {"role": "system", "message": "ignored", "timeInCallSecs": 2},  # bad role
        {"role": "agent", "message": "ok", "timeInCallSecs": 3},
    ]
    replayed = await replay_turns_to(
        participant,
        turns=turns,
        target_identity="c1",
        agent_identity="a1",
        candidate_identity="c1",
    )
    assert replayed == 1
    assert len(calls) == 1
    assert calls[0]["sender_identity"] == "a1"


@pytest.mark.asyncio
async def test_replay_continues_after_individual_failure():
    # Fail the second stream_text only; the first and third should still go.
    def _side_effect(call_index: int):
        if call_index == 1:
            return RuntimeError("boom")
        return None

    participant, calls, _ = _make_local_participant(
        stream_text_side_effect=_side_effect
    )
    turns = [
        {"role": "agent", "message": "first"},
        {"role": "user", "message": "second"},
        {"role": "agent", "message": "third"},
    ]
    replayed = await replay_turns_to(
        participant,
        turns=turns,
        target_identity="c1",
        agent_identity="a1",
        candidate_identity="c1",
    )
    assert replayed == 2
    assert len(calls) == 3
