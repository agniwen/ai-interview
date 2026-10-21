"use client";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import type { StreamdownTextComponents } from "@assistant-ui/react-streamdown";
import { cjk } from "@streamdown/cjk";
import type { AnimateOptions } from "streamdown";
import { markdownComponents } from "@/components/features/display/markdown-view";

// Streamdown 自带的元素样式位于 utilities 层，会压过 typeset；这里回退为原生标签，
// 排版继续交给 typeset，与 MarkdownView 保持一致。表格沿用 MarkdownView 的组件。
// SAFETY: markdownComponents 只覆盖 table 系列标签，props 与对应原生元素一致；
// Streamdown 的 Components 额外带有 Record<string, unknown> 索引签名，无法直接推断兼容。
const recruitingMarkdownComponents = {
  ...markdownComponents,
  a: "a",
  blockquote: "blockquote",
  code: "code",
  em: "em",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  hr: "hr",
  li: "li",
  ol: "ol",
  pre: "pre",
  strong: "strong",
  ul: "ul",
} as StreamdownTextComponents;

// 中文没有空格分词，按字符从模糊中浮现。节奏由 Streamdown 的共享时间线负责
// （积压上限 maxBacklogMs），不再叠加 assistant-ui 的 useSmooth。
const streamingAnimation: AnimateOptions = {
  animation: "blurIn",
  duration: 240,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  sep: "char",
  stagger: 12,
};

// cjk 插件修正中文标点紧邻 ** 等强调标记时无法解析的问题。
const plugins = { cjk };

/** 助手回复的文本片段：从当前 message part 读取文本与运行状态，流式时逐字浮现并显示光标。 */
export function RecruitingMarkdownText() {
  return (
    <StreamdownTextPrimitive
      animated={streamingAnimation}
      caret="block"
      className="streaming-markdown"
      components={recruitingMarkdownComponents}
      containerClassName="aui-markdown-text typeset typeset-compact min-w-0 max-w-full"
      plugins={plugins}
    />
  );
}
