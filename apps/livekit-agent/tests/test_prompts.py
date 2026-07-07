from prompts import build_instructions


def _base_ctx(**overrides):
    ctx = {
        "candidate_name": "郭靖",
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
    assert "## 公司情况\n" not in out


def test_company_context_section_omitted_when_missing_key():
    ctx = _base_ctx()
    ctx.pop("global_company_context")
    out = build_instructions(ctx)
    assert "## 公司情况\n" not in out


def test_company_question_handoff_rule_is_not_included():
    ctx = _base_ctx(global_company_context="")
    out = build_instructions(ctx)
    assert "## 公司情况问答" not in out
    assert "后续面试流程" not in out
    assert "其他面试官" not in out
    assert "仅基于上方" not in out


def test_interview_prompt_uses_candidate_language_policy():
    out = build_instructions(_base_ctx())
    assert "以候选人的主要语言为主" in out
    assert "题目若与候选人主要语言不同" in out
    assert "全程使用中文交流" not in out


def test_interview_prompt_skips_supplementary_questions_when_absent():
    out = build_instructions(
        _base_ctx(
            job_description_preset_questions=[
                {"content": "请介绍一个你负责过的后端项目。", "difficulty": "easy"}
            ],
            interview_questions=[],
        )
    )

    assert "本轮没有从简历生成的补充题目" in out
    assert "请跳过补充题目环节" in out
    assert "从以下题目中再随机抽取三到五道" not in out


def test_medium_questions_allow_up_to_two_followups():
    out = build_instructions(
        _base_ctx(
            job_description_preset_questions=[
                {"content": "请介绍一次线上故障排查经历。", "difficulty": "medium"}
            ]
        )
    )

    assert "[medium] 题: 最多可针对关键细节追问两次" in out
    assert '不得超过 [medium] 题"最多两次追问"的上限' in out
    assert "[medium] 题: 仅可针对关键细节追问一次" not in out
    assert '不得超过 [medium] 题"仅一次追问"的上限' not in out


def test_question_metadata_is_included_as_internal_guidance():
    out = build_instructions(
        _base_ctx(
            job_description_preset_questions=[
                {
                    "content": "请介绍一次线上故障排查经历。",
                    "difficulty": "medium",
                    "evaluationFocus": "验证排障方法和复盘能力",
                    "followUpDirections": "追问定位链路、监控信号和后续预防措施",
                }
            ],
            interview_questions=[
                {
                    "difficulty": "hard",
                    "evaluationFocus": "验证系统设计权衡",
                    "followUpDirections": "追问容量估算和降级策略",
                    "order": 1,
                    "question": "如果核心服务不可用，你会如何设计降级方案？",
                }
            ],
        )
    )

    assert "考核点：验证排障方法和复盘能力" in out
    assert "追问方向：追问定位链路、监控信号和后续预防措施" in out
    assert "考核点：验证系统设计权衡" in out
    assert "追问方向：追问容量估算和降级策略" in out
    assert "考核点和追问方向仅供你内部参考，提问时不要念出来" in out
