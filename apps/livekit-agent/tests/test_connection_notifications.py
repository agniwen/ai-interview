from unittest.mock import AsyncMock

from connection_notifications import ConnectionNotifications


async def test_connection_notifications_are_ordered_and_ui_only():
    participant = AsyncMock()
    writers = [AsyncMock(), AsyncMock()]
    participant.stream_text.side_effect = writers
    notifications = ConnectionNotifications(participant)
    notifications("reconnecting")
    notifications("reconnected")
    await notifications.aclose()
    calls = participant.stream_text.call_args_list
    assert [c.kwargs["attributes"]["interview.connection_state"] for c in calls] == [
        "reconnecting",
        "reconnected",
    ]
    assert all(c.kwargs["topic"] == "lk.transcription" for c in calls)
    assert (
        calls[0].kwargs["attributes"]["lk.segment_id"]
        != calls[1].kwargs["attributes"]["lk.segment_id"]
    )
    for writer in writers:
        writer.write.assert_awaited_once()
        writer.aclose.assert_awaited_once()


async def test_notification_failure_does_not_prevent_recovered_notification():
    participant = AsyncMock()
    writer = AsyncMock()
    participant.stream_text.side_effect = [RuntimeError("disconnected"), writer]
    notifications = ConnectionNotifications(participant)
    notifications("reconnecting")
    notifications("reconnected")
    await notifications.aclose()
    writer.aclose.assert_awaited_once()
