from types import SimpleNamespace

from ready_check_task import _TASK_INSTRUCTIONS, ReadyCheckTask


class _Session:
    def __init__(self):
        self.endpointing = None

    def update_options(self, *, endpointing_opts):
        self.endpointing = endpointing_opts

    async def generate_reply(self, **_kwargs):
        return None


def test_task_stores_opening_instructions():
    task = ReadyCheckTask(opening_instructions="你好郭靖, 准备好了吗?")
    assert task._opening_instructions == "你好郭靖, 准备好了吗?"


def test_task_exposes_two_tools():
    task = ReadyCheckTask(opening_instructions="x")
    tool_names = {fn.__name__ for fn in task.tools}
    assert tool_names == {"confirm_ready", "decline_interview"}


def test_task_requires_simplified_chinese():
    assert "全程使用简体中文" in _TASK_INSTRUCTIONS
    assert "I'm ready" in _TASK_INSTRUCTIONS
    assert "以候选人的主要语言为主" not in _TASK_INSTRUCTIONS


async def test_ready_check_uses_short_confirmation_endpointing(monkeypatch):
    task = ReadyCheckTask(opening_instructions="你好")
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
