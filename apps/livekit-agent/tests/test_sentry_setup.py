import pytest

from sentry_setup import initialize_sentry


def test_initialize_sentry_stays_disabled_without_dsn() -> None:
    calls: list[dict[str, object]] = []

    enabled = initialize_sentry(
        {}, init=lambda **options: calls.append(options), set_tag=lambda *_: None
    )

    assert enabled is False
    assert calls == []


def test_initialize_sentry_uses_privacy_first_error_monitoring() -> None:
    calls: list[dict[str, object]] = []

    enabled = initialize_sentry(
        {
            "SENTRY_DSN": " https://public@example.ingest.sentry.io/1 ",
            "SENTRY_ENVIRONMENT": " production ",
            "SENTRY_RELEASE": " abc123 ",
        },
        init=lambda **options: calls.append(options),
        set_tag=lambda *_: None,
    )

    assert enabled is True
    assert len(calls) == 1
    options = calls[0]
    assert options["dsn"] == "https://public@example.ingest.sentry.io/1"
    assert options["environment"] == "production"
    assert options["release"] == "abc123"
    assert options["send_default_pii"] is False
    assert options["include_local_variables"] is False
    assert options["traces_sample_rate"] == 0.0


def test_initialize_sentry_scrubs_candidate_data() -> None:
    calls: list[dict[str, object]] = []
    initialize_sentry(
        {"SENTRY_DSN": "https://public@example.ingest.sentry.io/1"},
        init=lambda **options: calls.append(options),
        set_tag=lambda *_: None,
    )
    before_send = calls[0]["before_send"]

    event = before_send(
        {
            "extra": {"prompt": "请分析这份简历", "retry_count": 1},
            "request": {
                "cookies": {"session": "secret"},
                "data": {"resume": "private resume"},
                "headers": {
                    "authorization": "Bearer secret",
                    "x-request-id": "request-1",
                },
            },
            "user": {
                "email": "candidate@example.com",
                "id": "internal-user-id",
                "ip_address": "127.0.0.1",
            },
        },
        {},
    )

    assert event == {
        "extra": {"prompt": "[Filtered]", "retry_count": 1},
        "request": {"headers": {"x-request-id": "request-1"}},
        "user": {"id": "internal-user-id"},
    }


def test_importing_the_agent_under_tests_never_reports_to_sentry():
    import sentry_sdk

    import agent  # noqa: F401

    assert sentry_sdk.get_client().is_active() is False


def _before_send():
    calls: list[dict[str, object]] = []
    initialize_sentry(
        {"SENTRY_DSN": "https://public@example.ingest.sentry.io/1"},
        init=lambda **options: calls.append(options),
        set_tag=lambda *_: None,
    )
    return calls[0]["before_send"]


def _log_event(logger: str, message: str) -> dict[str, object]:
    return {
        "level": "error",
        "logentry": {"formatted": message, "message": message},
        "logger": logger,
    }


@pytest.mark.parametrize(
    "message",
    [
        "livekit::rtc_engine:988:livekit::rtc_engine - resuming connection... attempt: 1",
        "livekit::rtc_engine:942:livekit::rtc_engine - restarting connection... attempt: 2",
        "livekit::rtc_engine:1015:livekit::rtc_engine - resuming connection failed: "
        "signal failure: server sent leave during reconnect: reason=StateMismatch, "
        "action=Reconnect",
        "livekit_api::signal_client::signal_stream:160:livekit_api::signal_client::"
        'signal_stream - websocket recv error: Connection("IO error: Connection reset '
        'by peer (os error 104)")',
        "livekit::rtc_engine::rtc_session:679:livekit::rtc_engine::rtc_session - "
        "publisher data channel '_reliable' closed unexpectedly",
    ],
)
def test_initialize_sentry_drops_recoverable_livekit_reconnect_logs(
    message: str,
) -> None:
    assert _before_send()(_log_event("livekit", message), {}) is None


@pytest.mark.parametrize(
    ("logger", "message"),
    [
        ("livekit", "livekit::rtc_engine - failed to connect: engine closed"),
        ("livekit.agents", "resuming connection... attempt: 1"),
        ("realtime_interview_agent", "report API returned 500"),
    ],
)
def test_initialize_sentry_keeps_other_errors(logger: str, message: str) -> None:
    event = _log_event(logger, message)

    assert _before_send()(event, {}) == event
