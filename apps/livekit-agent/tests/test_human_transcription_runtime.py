import httpx
import pytest

from human_transcription.runtime import SentenceLedger, claim_execution


def test_corrections_use_sentence_identity_not_request_or_text():
    ledger = SentenceLedger()
    assert ledger.identify({"sentence_id": 1, "begin_time": 0, "text": "重复"}) == (
        "1",
        0,
    )
    assert ledger.identify({"sentence_id": 1, "begin_time": 0, "text": "修正"}) == (
        "1",
        1,
    )
    assert ledger.identify({"sentence_id": 2, "begin_time": 1000, "text": "重复"}) == (
        "2",
        0,
    )


def test_missing_sentence_ids_use_monotonic_counter():
    ledger = SentenceLedger()
    assert ledger.identify({"text": "重复"}) == ("local-1", 0)
    assert ledger.identify({"text": "重复"}) == ("local-2", 0)


def test_interim_updates_do_not_advance_final_revision_or_fallback_sentence_id():
    ledger = SentenceLedger()
    assert ledger.preview_identity({"text": "我"}) == ("local-1", 0)
    assert ledger.preview_identity({"text": "我的工作"}) == ("local-1", 0)
    assert ledger.identify({"text": "我的工作。"}) == ("local-1", 0)
    assert ledger.preview_identity({"text": "下一句"}) == ("local-2", 0)
    assert ledger.preview_identity({"sentence_id": 1}) == ("1", 0)
    assert ledger.identify({"sentence_id": 1}) == ("1", 0)
    assert ledger.preview_identity({"sentence_id": 1}) == ("1", 1)


async def test_reconnect_has_one_owner_and_three_attempt_budget():
    import asyncio

    from human_transcription.retry import capture_with_retries

    attempts, delays = [], []

    async def capture():
        attempts.append(1)
        return False

    async def delay(seconds):
        delays.append(seconds)

    await capture_with_retries(capture, asyncio.Event(), delay)
    assert len(attempts) == 3
    assert delays == [1, 2]


async def test_cutoff_during_failure_prevents_another_provider_connection():
    import asyncio

    from human_transcription.retry import capture_with_retries

    stopping = asyncio.Event()
    attempts = []

    async def capture():
        attempts.append(1)
        stopping.set()
        return False

    await capture_with_retries(capture, stopping)
    assert len(attempts) == 1


def _status_error(status, body):
    request = httpx.Request(
        "POST", "https://server.invalid/api/agent/human-transcription/claim"
    )
    response = httpx.Response(status, json=body, request=request)
    return httpx.HTTPStatusError("rejected", request=request, response=response)


async def test_stale_dispatch_claim_exits_quietly_with_server_reason(caplog):
    async def post(path):
        assert path == "claim"
        raise _status_error(409, {"error": "任务已被其他执行者认领"})

    assert await claim_execution(post, run_id="run", generation=2) is None
    assert "任务已被其他执行者认领" in caplog.text
    assert "generation=2" in caplog.text


async def test_claim_failures_other_than_conflict_still_raise():
    async def post(_path):
        raise _status_error(500, {"error": "boom"})

    with pytest.raises(httpx.HTTPStatusError):
        await claim_execution(post, run_id="run", generation=1)


async def test_successful_claim_is_returned():
    async def post(_path):
        return {"participants": {}}

    assert await claim_execution(post, run_id="run", generation=1) == {
        "participants": {}
    }
