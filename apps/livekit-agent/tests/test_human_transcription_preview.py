import asyncio
import json

from human_transcription.preview import PreviewPublisher


def event(text="正在回答", kind="interim", item="1"):
    return {
        "kind": kind,
        "text": text,
        "streamEpoch": "epoch",
        "providerTaskId": "task",
        "itemId": item,
    }


async def test_preview_coalesces_updates_and_delivers_final_to_interviewers_only():
    sent = []

    async def publish(data, **kwargs):
        sent.append((json.loads(data), kwargs))

    preview = PreviewPublisher(
        publish,
        {"runId": "run", "generation": 1, "executionId": "exec"},
        ["interviewer_1"],
    )
    preview.offer(event("我"))
    preview.offer(event("我的经验"))
    preview.offer(event("我的经验。", "final"))
    task = asyncio.create_task(preview.run())
    try:
        async with asyncio.timeout(1):
            while not sent:
                await asyncio.sleep(0)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    assert len(sent) == 1
    assert sent[0][0]["event"]["kind"] == "final"
    assert sent[0][0]["sequence"] == 3
    assert sent[0][1]["destination_identities"] == ["interviewer_1"]
    assert sent[0][1]["reliable"] is True


async def test_empty_audience_never_broadcasts_and_queue_is_bounded():
    async def publish(*_, **__):
        raise AssertionError("must not broadcast")

    preview = PreviewPublisher(publish, {}, [])
    preview.offer(event())
    assert not preview.pending
    preview = PreviewPublisher(publish, {}, ["host"])
    for index in range(200):
        preview.offer(event(item=str(index)))
    assert len(preview.pending) <= 64


async def test_failed_preview_does_not_stop_later_delivery():
    calls = []

    async def publish(data, **_):
        calls.append(json.loads(data))
        if len(calls) == 1:
            raise RuntimeError("disconnected")

    preview = PreviewPublisher(publish, {}, ["host"])
    preview.offer(event(item="1"))
    preview.offer(event(item="2"))
    task = asyncio.create_task(preview.run())
    try:
        async with asyncio.timeout(1):
            while len(calls) < 2:
                await asyncio.sleep(0)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    assert calls[1]["event"]["itemId"] == "2"


def test_oversized_preview_is_skipped_without_truncating_final_text():
    preview = PreviewPublisher(None, {}, ["host"])
    preview.offer(event("字" * 20000, "final"))
    assert not preview.pending
