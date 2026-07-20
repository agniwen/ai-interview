# ReadyCheckTask and WrapUpTask repeat this policy in their phase-specific
# instructions. InterviewAgent also appends it to the versioned dispatch prompt
# so an independently deployed worker enforces the same language requirement.
LANGUAGE_POLICY = (
    "本次是中文面试，全程使用简体中文交流，包括开场、提问、追问、澄清和告别。"
    "候选人使用其他语言或要求切换语言时，仍使用简体中文，并请候选人尽量用中文作答。"
    "专业术语可以保留必要的外文原文，但解释和完整句子必须使用简体中文。"
)
