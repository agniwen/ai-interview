"""Privacy-first Sentry initialization for the LiveKit worker process."""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping
from typing import Any

import sentry_sdk

_FILTERED_VALUE = "[Filtered]"
_SENSITIVE_KEYS = (
    "authorization",
    "cookie",
    "token",
    "secret",
    "password",
    "passcode",
    "api_key",
    "access_key",
    "email",
    "phone",
    "mobile",
    "contact",
    "candidate_name",
    "resume",
    "transcript",
    "prompt",
    "recording",
    "audio",
    "body",
    "content",
)


def _trimmed(value: str | None) -> str | None:
    normalized = value.strip() if value else ""
    return normalized or None


def _is_sensitive_key(key: object) -> bool:
    normalized = str(key).lower().replace("-", "_")
    return any(sensitive in normalized for sensitive in _SENSITIVE_KEYS)


def _sanitize_value(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: _FILTERED_VALUE if _is_sensitive_key(key) else _sanitize_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_sanitize_value(item) for item in value)
    return value


def _sanitize_headers(headers: object) -> dict[object, object]:
    if not isinstance(headers, dict):
        return {}
    return {key: value for key, value in headers.items() if not _is_sensitive_key(key)}


def _before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(event)
    for key in ("extra", "contexts", "breadcrumbs"):
        if key in sanitized:
            sanitized[key] = _sanitize_value(sanitized[key])

    request = sanitized.get("request")
    if isinstance(request, dict):
        headers = _sanitize_headers(request.get("headers"))
        sanitized["request"] = {"headers": headers} if headers else {}

    user = sanitized.get("user")
    if isinstance(user, dict):
        user_id = user.get("id")
        sanitized["user"] = {"id": user_id} if user_id is not None else {}

    return sanitized


def initialize_sentry(
    environ: Mapping[str, str] = os.environ,
    *,
    init: Callable[..., object] = sentry_sdk.init,
    set_tag: Callable[[str, object], None] = sentry_sdk.set_tag,
) -> bool:
    """Initialize error monitoring when a project-specific or fallback DSN exists."""

    dsn = _trimmed(environ.get("SENTRY_AGENT_DSN")) or _trimmed(
        environ.get("SENTRY_DSN")
    )
    if not dsn:
        return False

    init(
        before_send=_before_send,
        dsn=dsn,
        enable_logs=False,
        environment=_trimmed(environ.get("SENTRY_ENVIRONMENT")) or "production",
        include_local_variables=False,
        release=_trimmed(environ.get("SENTRY_RELEASE")),
        send_default_pii=False,
        traces_sample_rate=0.0,
    )
    set_tag("arc.runtime", "livekit-agent")
    return True
