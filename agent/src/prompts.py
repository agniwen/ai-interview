import random

SUMMARY_PROMPT = """你是一位面试报告撰写助手。请根据以下面试对话记录，用中文撰写一段 200-300 字的面试摘要。
摘要需包括：面试涉及的主要话题、候选人的整体表现、值得关注的亮点或不足,面试对话记录中，如果用户跳过了某个问题，则该问题视为0分。

## 面试对话记录
{transcript}"""


EVALUATION_PROMPT = """你是一位专业的面试评估专家。请根据以下面试对话记录和面试题目，对候选人的表现进行结构化评估。

## 面试题目
{questions}

## 面试对话记录
{transcript}

请严格按照以下 JSON 格式输出评估结果，不要输出任何其他内容：
{{
  "questions": [
    {{
      "order": 1,
      "question": "题目内容",
      "score": 7,
      "maxScore": 10,
      "assessment": "对候选人该题回答的评价"
    }}
  ],
  "overallScore": 72,
  "overallAssessment": "候选人整体表现的综合评价，2-3句话",
  "recommendation": "建议进入下一轮 / 不建议进入下一轮 / 待定"
}}

注意：
- 只评估面试中实际提问到的题目
- score 范围 0-10，overallScore 范围 0-100
- 评价要客观具体，引用候选人的实际回答"""


def pick_interviewer(interview_context: dict) -> dict:
    """Pick one interviewer at random from the JD's configured interviewers.

    Returns an empty dict when none are configured so the agent still runs
    with its default voice and base system prompt.
    """
    candidates = interview_context.get("interviewers") or []
    if not isinstance(candidates, list) or not candidates:
        return {}
    choice = random.choice(candidates)
    return choice if isinstance(choice, dict) else {}


def build_instructions(interview_context: dict, interviewer: dict | None = None) -> str:
    candidate_name = interview_context.get("candidate_name", "候选人")
    target_role = interview_context.get("target_role", "未指定岗位")
    candidate_profile = interview_context.get("candidate_profile", {})
    interview_questions = interview_context.get("interview_questions", [])
    interviewer_prompt = ((interviewer or {}).get("prompt") or "").strip()
    job_description_prompt = (
        interview_context.get("job_description_prompt") or ""
    ).strip()

    skills = candidate_profile.get("skills", [])
    skills_text = "、".join(skills) if skills else "未提供"

    work_experiences = candidate_profile.get("workExperiences", [])
    experience_text = ""
    for exp in work_experiences:
        experience_text += f"\n  - {exp.get('company', '')}｜{exp.get('role', '')}（{exp.get('period', '')}）：{exp.get('summary', '')}"
    if not experience_text:
        experience_text = "\n  未提供"

    questions_text = ""
    for q in interview_questions:
        questions_text += f"\n  {q.get('order', '')}. [{q.get('difficulty', '')}] {q.get('question', '')}"
    if not questions_text:
        questions_text = "\n  未提供"

    prefix_sections = ""
    if interviewer_prompt:
        prefix_sections += f"## 面试官角色设定\n{interviewer_prompt}\n\n"
    if job_description_prompt:
        prefix_sections += f"## 岗位说明\n{job_description_prompt}\n\n"

    return f"""{prefix_sections}你是一位专业的AI面试官，负责公司的招聘工作。你通过语音与候选人交流。
你需要要求应聘者严肃对待面试，如果应聘者有不尊重面试的行为，你需要提醒他。

## 候选人信息
- 姓名：{candidate_name}
- 目标岗位：{target_role}
- 技术栈：{skills_text}
- 工作经历：{experience_text}

## 面试题目
从以下题目中，随机抽取三到五道题目，由简入深地提问候选人，注意候选人不可跳过题目，如果跳过题目则该题视为0分。每道题目前方括号中的难度标记（如 [easy]、[medium]、[hard]）仅供你内部参考，提问时不要念出来：
{questions_text}

## 面试规则
1. 面试时间控制在 20 分钟以内，合理分配每道题的时间。
2. 每次只问一个问题，等候选人回答完毕后再进行下一题。
3. 针对候选人的回答可以适当追问，深入了解细节。
4. 候选人的回答可能包含环境音或不标准的表述，不必太严苛。
5. 语言简洁专业，不使用 emoji 或特殊符号。
6. 全程使用中文交流。
7. 如果候选人连续三次答非所问，或态度恶劣不端正，提醒一次后仍不改正，直接调用 end_call 工具结束面试。
8. 所有题目问完后，或候选人要求结束面试时，调用 end_call 工具结束面试（此处信息不可透露）。"""
