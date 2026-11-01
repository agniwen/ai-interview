import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf-8");

describe("message bundle boundaries", () => {
  it("keeps lightweight message primitives independent from rich markdown rendering", () => {
    const primitives = readSource("components/ai-elements/message-primitives.tsx");

    expect(primitives).not.toContain("streamdown");
    expect(primitives).not.toContain("@streamdown/");
    expect(primitives).not.toContain("MessageResponse");
  });

  it("keeps static homepage and interview transcript messages off the rich message module", () => {
    const homepage = readSource("components/features/home/feature-blocks.tsx");
    const transcript = readSource(
      "components/features/studio/interviews/interview-detail/conversation-transcript.tsx",
    );

    // 首页与面试转写都自绘消息气泡（转写正文用 react-markdown 的 MarkdownView），不再依赖消息组件；
    // 只约束它们不能引入富文本消息模块及其 streamdown 渲染。
    // Both draw their own bubbles (the transcript renders text through react-markdown's MarkdownView);
    // they only must not pull in the rich message module or its streamdown renderer.
    for (const source of [homepage, transcript]) {
      expect(source).not.toContain('from "@/components/ai-elements/message"');
      expect(source).not.toContain("streamdown");
    }
  });

  it("preserves the existing message module exports for rich-message callers", () => {
    const message = readSource("components/ai-elements/message.tsx");

    expect(message).toContain('from "./message-primitives"');
    expect(message).toContain("MessageResponse");
  });
});
