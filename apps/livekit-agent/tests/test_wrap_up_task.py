from wrap_up_task import _WRAP_UP_INSTRUCTIONS


def test_wrap_up_uses_candidate_language_policy():
    assert "以候选人的主要语言为主" in _WRAP_UP_INSTRUCTIONS
    assert "全程使用中文" not in _WRAP_UP_INSTRUCTIONS
