from interview_agent import (
    DEFAULT_CLOSING_INSTRUCTIONS,
    DEFAULT_OPENING_INSTRUCTIONS,
    InterviewAgent,
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
    assert a._opening_instructions == DEFAULT_OPENING_INSTRUCTIONS


def test_uses_custom_closing_when_provided():
    custom = "感谢您的时间，再见。"
    a = InterviewAgent(_ctx(global_closing_instructions=custom))
    assert a._closing_instructions == custom


def test_falls_back_to_default_closing_when_empty():
    a = InterviewAgent(_ctx(global_closing_instructions=""))
    assert a._closing_instructions == DEFAULT_CLOSING_INSTRUCTIONS
