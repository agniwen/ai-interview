from types import SimpleNamespace
from typing import ClassVar

from wrap_up_task import _WRAP_UP_INSTRUCTIONS


class _EndCallTool:
    tools: ClassVar[list] = []


class _Session:
    def __init__(self):
        self.endpointing = None
        self.replies = []

    def update_options(self, *, endpointing_opts):
        self.endpointing = endpointing_opts

    async def generate_reply(self, **kwargs):
        self.replies.append(kwargs)
        return None


def test_wrap_up_requires_simplified_chinese():
    assert "全程使用简体中文" in _WRAP_UP_INSTRUCTIONS
    assert "以候选人的主要语言为主" not in _WRAP_UP_INSTRUCTIONS


async def test_wrap_up_uses_short_confirmation_endpointing(monkeypatch):
    task = __import__("wrap_up_task").WrapUpTask(_EndCallTool())
    session = _Session()
    monkeypatch.setattr(
        task,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await task.on_enter()

    assert session.endpointing == {
        "mode": "dynamic",
        "min_delay": 0.4,
        "max_delay": 2.5,
    }


async def test_candidate_ended_round_goes_directly_to_goodbye(monkeypatch):
    task = __import__("wrap_up_task").WrapUpTask(
        _EndCallTool(),
        ask_closing_question=False,
    )
    session = _Session()
    monkeypatch.setattr(
        task,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await task.on_enter()

    assert "不要再提出任何问题" in session.replies[0]["instructions"]
    assert "调用 end_call" in session.replies[0]["instructions"]
