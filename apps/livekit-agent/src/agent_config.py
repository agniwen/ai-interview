import os
from collections.abc import Mapping

DEFAULT_AGENT_NAME = "giaogiao"


def resolve_agent_name(env: Mapping[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    return source.get("AGENT_NAME", "").strip() or DEFAULT_AGENT_NAME
