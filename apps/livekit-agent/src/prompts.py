# ReadyCheckTask and WrapUpTask repeat this policy in their phase-specific
# instructions. The main interview system prompt is built in TypeScript and is
# delivered through the versioned dispatch contract.
LANGUAGE_POLICY = (
    "以候选人的主要语言为主进行交流：根据候选人的发言自动判断语言，后续尽量保持同一种语言；"
    "候选人切换语言或明确要求使用某种语言时立即跟随。若候选人尚未发言，使用开场指令或面试材料的语言；"
    "仍无法判断时默认使用中文。题目若与候选人主要语言不同，请自然翻译后提问，保持考查点和难度不变。"
)
