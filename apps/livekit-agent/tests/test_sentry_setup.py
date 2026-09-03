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
