from human_transcription.runtime import SentenceLedger


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
