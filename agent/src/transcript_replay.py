"""Replay in-progress transcript to a reconnected candidate.

When the candidate drops mid-interview and rejoins within the hot-reconnect
grace window (see ``_on_participant_connected`` in ``agent.py``), the new
LiveKit session subscription starts empty: prior transcription text streams
were already consumed by the previous browser tab and the protocol does not
replay them.

This module pushes the agent's accumulated ``state["turns"]`` back to the
rejoining participant via ``room.local_participant.stream_text`` on the
``lk.transcription`` topic. Critically, ``stream_text`` accepts a
``sender_identity`` override so user turns can be attributed to the candidate
identity (matching what STT does live), and the frontend
``useSessionMessages`` hook will bucket them as ``userTranscript`` /
``agentTranscript`` correctly.

This is the same mechanism the framework's
``_ParticipantStreamTranscriptionOutput`` uses internally — we use the public
``stream_text`` API directly so we don't depend on a private module path.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Protocol

logger = logging.getLogger("agent")


# 与 LiveKit Agents types.py 保持一致, 直接写字面量避免依赖私有模块路径.
# Mirrors livekit.agents.types constants; inlined as literals to avoid
# importing from a private module path.
TRANSCRIPTION_TOPIC = "lk.transcription"
ATTR_TRANSCRIPTION_FINAL = "lk.transcription_final"
ATTR_SEGMENT_ID = "lk.segment_id"


class _TextStreamWriterLike(Protocol):
    async def write(self, text: str) -> Any: ...
    async def aclose(self) -> Any: ...


class _LocalParticipantLike(Protocol):
    async def stream_text(
        self,
        *,
        topic: str,
        sender_identity: str | None = None,
        destination_identities: list[str] | None = None,
        attributes: dict[str, str] | None = None,
    ) -> _TextStreamWriterLike: ...


async def replay_turns_to(
    local_participant: _LocalParticipantLike,
    *,
    turns: list[dict],
    target_identity: str,
    agent_identity: str,
    candidate_identity: str,
) -> int:
    """Replay ``turns`` to ``target_identity`` as transcription text streams.

    Returns the number of turns successfully replayed. Failures on individual
    turns are logged and skipped so a single bad write does not abort the
    rest of the replay.

    - ``role == "user"`` turns are attributed to ``candidate_identity`` via
      ``sender_identity`` so the frontend renders them as user transcripts.
    - ``role == "agent"`` turns are attributed to ``agent_identity`` (the
      agent's local participant identity).
    - ``destination_identities`` is restricted to ``target_identity`` so other
      observers (admins, recording subscribers) don't see the duplicated
      replay traffic.
    """
    if not turns:
        return 0

    replayed = 0
    for index, turn in enumerate(turns):
        role = turn.get("role")
        message = (turn.get("message") or "").strip()
        if not message or role not in ("user", "agent"):
            continue

        sender_identity = candidate_identity if role == "user" else agent_identity
        # 唯一 segment_id 防止前端按 id 去重时把多条历史合并成一条.
        # Unique segment id per turn so the frontend's id-based dedupe doesn't
        # collapse multiple replayed turns into one.
        segment_id = f"replay-{index}-{uuid.uuid4().hex[:8]}"

        try:
            writer = await local_participant.stream_text(
                topic=TRANSCRIPTION_TOPIC,
                sender_identity=sender_identity,
                destination_identities=[target_identity],
                attributes={
                    ATTR_TRANSCRIPTION_FINAL: "true",
                    ATTR_SEGMENT_ID: segment_id,
                },
            )
            await writer.write(message)
            await writer.aclose()
            replayed += 1
        except Exception:
            logger.exception(
                "transcript replay failed at turn %d (role=%s)", index, role
            )

    logger.info(
        "transcript replay: %d/%d turns sent to %s",
        replayed,
        len(turns),
        target_identity,
    )
    return replayed
