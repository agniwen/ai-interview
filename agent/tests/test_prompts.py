from prompts import build_instructions


def _base_ctx(**overrides):
    ctx = {
        "candidate_name": "张三",
        "target_role": "后端工程师",
        "candidate_profile": {"skills": [], "workExperiences": []},
        "interview_questions": [],
        "job_description_preset_questions": [],
        "job_description_prompt": "",
        "global_company_context": "",
    }
    ctx.update(overrides)
    return ctx


def test_company_context_section_included_when_provided():
    # 当提供公司情况时，system prompt 中应包含"## 公司情况"及其内容  # noqa: RUF003
    # When company context is provided, the system prompt should contain the section.
    ctx = _base_ctx(global_company_context="我们是一家做 AI 面试的公司，规模 50 人。")
    out = build_instructions(ctx)
    assert "## 公司情况" in out
    assert "AI 面试" in out


def test_company_context_section_omitted_when_empty():
    # 当公司情况为空字符串时，system prompt 中不应出现"## 公司情况"  # noqa: RUF003
    # When company context is an empty string, the section should be omitted.
    ctx = _base_ctx(global_company_context="")
    out = build_instructions(ctx)
    assert "## 公司情况" not in out


def test_company_context_section_omitted_when_missing_key():
    # 当 interview_context 中不含该键时，system prompt 中不应出现"## 公司情况"  # noqa: RUF003
    # When the key is absent from the context dict, the section should be omitted.
    ctx = _base_ctx()
    ctx.pop("global_company_context")
    out = build_instructions(ctx)
    assert "## 公司情况" not in out
