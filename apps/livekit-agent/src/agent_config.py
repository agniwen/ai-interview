import os
from collections.abc import Mapping

DEFAULT_AGENT_NAME = "giaogiao"


def resolve_voice_mode(env: Mapping[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    value = source.get("INTERVIEW_VOICE_MODE", "").strip() or "realtime"
    if value not in {"realtime", "pipeline"}:
        raise ValueError("INTERVIEW_VOICE_MODE must be realtime or pipeline")
    return value


def resolve_agent_name(env: Mapping[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    return source.get("AGENT_NAME", "").strip() or DEFAULT_AGENT_NAME


def resolve_self_hosted(env: Mapping[str, str] | None = None) -> bool:
    source = os.environ if env is None else env
    value = source.get("INTERVIEW_SELF_HOSTED", "").strip().lower()
    if not value:
        return True
    return value not in ("0", "false", "no", "off")
