from wrap_up_task import _WRAP_UP_INSTRUCTIONS


def test_wrap_up_requires_simplified_chinese():
    assert "全程使用简体中文" in _WRAP_UP_INSTRUCTIONS
    assert "以候选人的主要语言为主" not in _WRAP_UP_INSTRUCTIONS
