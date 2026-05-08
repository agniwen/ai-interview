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
    <section className="mx-auto mb-0.5 w-full max-w-5xl px-2 sm:px-3">
      <p className="mb-2 px-1 font-medium text-muted-foreground text-xs">快速提问</p>
      {/*
        左右两侧 32px 的渐隐遮罩，跟首页 Marquee 的视觉一致。
        Suggestions 内层是 ScrollArea，遮罩放在外层 wrapper 上，scroll 时内容
        滑过遮罩区域自然变淡，而不是被硬截断。
        32px fade-out mask on both edges, matching the home Marquee. The mask
        sits on the wrapper so scrolled content visually fades into the
        boundary instead of getting hard-cut.
      */}
      <div
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 32px, black calc(100% - 32px), transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0, black 32px, black calc(100% - 32px), transparent 100%)",
        }}
      >
        <Suggestions className="gap-2.5 px-1 pb-1">
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
      </div>
    </section>
  );
}
