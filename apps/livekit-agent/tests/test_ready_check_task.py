from ready_check_task import _TASK_INSTRUCTIONS, ReadyCheckTask


def test_task_stores_opening_instructions():
    task = ReadyCheckTask(opening_instructions="你好郭靖, 准备好了吗?")
    assert task._opening_instructions == "你好郭靖, 准备好了吗?"


def test_task_exposes_two_tools():
    task = ReadyCheckTask(opening_instructions="x")
    tool_names = {fn.__name__ for fn in task.tools}
    assert tool_names == {"confirm_ready", "decline_interview"}


def test_task_uses_candidate_language_policy():
    assert "以候选人的主要语言为主" in _TASK_INSTRUCTIONS
    assert "I'm ready" in _TASK_INSTRUCTIONS
    assert "全程使用中文" not in _TASK_INSTRUCTIONS
