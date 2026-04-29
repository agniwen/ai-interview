from interview_agent import (
    DEFAULT_CLOSING_INSTRUCTIONS,
    DEFAULT_OPENING_INSTRUCTIONS,
    InterviewAgent,
    _apply_placeholders,
)


def _ctx(**overrides):
    ctx = {
        "candidate_name": "张三",
        "target_role": "后端工程师",
        "candidate_profile": {"skills": [], "workExperiences": []},
        "interview_questions": [],
        "job_description_preset_questions": [],
        "job_description_prompt": "",
        "global_company_context": "",
        "global_opening_instructions": "",
        "global_closing_instructions": "",
    }
    ctx.update(overrides)
    return ctx


def test_uses_custom_opening_when_provided():
    custom = "用最热情的语气欢迎候选人，介绍你是 ACME 的面试官。"
    a = InterviewAgent(_ctx(global_opening_instructions=custom))
    assert a._opening_instructions == custom


def test_falls_back_to_default_opening_when_empty():
    a = InterviewAgent(_ctx(global_opening_instructions=""))
    expected = _apply_placeholders(DEFAULT_OPENING_INSTRUCTIONS, "张三", "后端工程师")
    assert a._opening_instructions == expected


def test_uses_custom_closing_when_provided():
    custom = "感谢您的时间，再见。"
    a = InterviewAgent(_ctx(global_closing_instructions=custom))
    assert a._closing_instructions == custom


def test_falls_back_to_default_closing_when_empty():
    a = InterviewAgent(_ctx(global_closing_instructions=""))
    assert a._closing_instructions == DEFAULT_CLOSING_INSTRUCTIONS


def test_opening_substitutes_candidate_name_and_role_placeholders():
    a = InterviewAgent(
        _ctx(
            global_opening_instructions="你好 {候选人姓名}，欢迎参加 {岗位} 的面试。",
            candidate_name="李四",
            target_role="前端工程师",
        )
    )
    assert a._opening_instructions == "你好 李四，欢迎参加 前端工程师 的面试。"


def test_closing_substitutes_candidate_name_placeholder():
    a = InterviewAgent(
        _ctx(
            global_closing_instructions="再见 {候选人姓名}，祝顺利。",
            candidate_name="李四",
        )
    )
    assert a._closing_instructions == "再见 李四，祝顺利。"


def test_default_opening_substitutes_placeholders():
    # 默认开场白本身含有占位符，应当被替换  # noqa: RUF003
    a = InterviewAgent(_ctx(candidate_name="王五", target_role="数据工程师"))
    assert "王五" in a._opening_instructions
    assert "数据工程师" in a._opening_instructions
    assert "{候选人姓名}" not in a._opening_instructions
    assert "{岗位}" not in a._opening_instructions
