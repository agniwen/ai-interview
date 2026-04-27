"use client";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useChatStreamingContext } from "../chat-runtime-context";
import { useComposerInputContext } from "../composer-input-context";

const QUICK_SUGGESTIONS = [
  "列出候选人的优点、缺点、风险关键项，团队定位、职级定级。",
  "这份简历是否建议进入面试？请给出理由和建议的面试重点。",
  "针对这份简历，生成一组面试追问问题，侧重验证项目真实性。",
  "帮我提炼候选人的核心竞争力和岗位匹配度分析。",
  "对比这几份简历，按综合匹配度排序并说明推荐理由。",
];

function focusComposerTextarea() {
  document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
}

export function QuickSuggestions() {
  const { isStreaming } = useChatStreamingContext();
  const { appendInput } = useComposerInputContext();

  return (
    <section className="mx-auto mb-0.5 w-full max-w-5xl px-2 sm:px-3" data-tour="suggestions">
      <p className="mb-2 px-1 font-medium text-muted-foreground text-xs">快速提问</p>
      <Suggestions className="gap-2.5 pb-1">
        {QUICK_SUGGESTIONS.map((suggestion) => (
          <Suggestion
            className="h-auto whitespace-normal rounded-2xl border-border/70 bg-card/70 px-4 py-2 text-left text-xs leading-relaxed hover:bg-accent"
            disabled={isStreaming}
            key={suggestion}
            onClick={(text) => {
              appendInput(text);
              focusComposerTextarea();
            }}
            suggestion={suggestion}
          />
        ))}
      </Suggestions>
    </section>
  );
}
