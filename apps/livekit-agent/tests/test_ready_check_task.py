from ready_check_task import ReadyCheckTask


def test_task_stores_opening_instructions():
    task = ReadyCheckTask(opening_instructions="你好郭靖, 准备好了吗?")
    assert task._opening_instructions == "你好郭靖, 准备好了吗?"


def test_task_exposes_two_tools():
    task = ReadyCheckTask(opening_instructions="x")
    tool_names = {fn.__name__ for fn in task.tools}
    assert tool_names == {"confirm_ready", "decline_interview"}
