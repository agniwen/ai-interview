import pytest

from human_transcription.outbox import EventOutbox


def test_retry_retains_identity_and_content(tmp_path):
    outbox = EventOutbox(tmp_path / "events.sqlite")
    outbox.append({"eventId": "one", "text": "原始回答"})
    assert outbox.pending() == [{"eventId": "one", "text": "原始回答"}]
    assert EventOutbox(tmp_path / "events.sqlite").pending() == outbox.pending()
    with pytest.raises(ValueError):
        outbox.append({"eventId": "one", "text": "修改回答"})
    outbox.ack(["one"])
    assert outbox.pending() == []


def test_capacity_is_bounded(tmp_path):
    outbox = EventOutbox(tmp_path / "events.sqlite", capacity=1)
    outbox.append({"eventId": "one"})
    with pytest.raises(OverflowError):
        outbox.append({"eventId": "two"})


async def test_replay_retries_finish_directly_after_all_events_were_acknowledged(
    tmp_path, monkeypatch
):
    import httpx

    from human_transcription.outbox import replay_transcription_outboxes

    monkeypatch.setenv("HUMAN_TRANSCRIPTION_OUTBOX_DIR", str(tmp_path))
    outbox = EventOutbox(tmp_path / "run.sqlite")
    outbox.set_metadata(
        {"baseUrl": "http://local", "payload": {"runId": "run"}, "finished": True}
    )
    paths = []

    def respond(request):
        paths.append(request.url.path)
        return httpx.Response(
            200 if request.url.path.endswith("/finish") else 409, json={"ok": True}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        await replay_transcription_outboxes(client, "http://local", "secret")
    assert paths == ["/api/agent/human-transcription/finish"]
    assert outbox.metadata()["acknowledged"] is True
