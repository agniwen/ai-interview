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
    ctx = _base_ctx(global_company_context="我们是一家做 AI 面试的公司，规模 50 人。")
    out = build_instructions(ctx)
    assert "## 公司情况\n我们是一家做 AI 面试的公司，规模 50 人。" in out


def test_company_context_section_omitted_when_empty():
    ctx = _base_ctx(global_company_context="")
    out = build_instructions(ctx)
    # 公司情况内容段不存在；只可能出现在"## 公司情况问答"规则段中  # noqa: RUF003
    assert "## 公司情况\n" not in out


def test_company_context_section_omitted_when_missing_key():
    ctx = _base_ctx()
    ctx.pop("global_company_context")
    out = build_instructions(ctx)
    assert "## 公司情况\n" not in out


def test_company_qa_rule_uses_provided_context_when_present():
    # 配置了公司情况：规则要求基于该内容作答  # noqa: RUF003
    ctx = _base_ctx(global_company_context="我们是 ACME。")
    out = build_instructions(ctx)
    assert "仅基于上方" in out
    assert "后续面试流程中由其他面试官" not in out


def test_company_qa_rule_defers_to_other_interviewers_when_absent():
    # 未配置公司情况：规则要求转到后续面试官回答  # noqa: RUF003
    ctx = _base_ctx(global_company_context="")
    out = build_instructions(ctx)
    assert "后续面试流程中由其他面试官" in out
    assert "仅基于上方" not in out
