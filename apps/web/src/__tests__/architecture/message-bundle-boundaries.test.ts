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

  it("uses lightweight primitives for static homepage and interview transcript messages", () => {
    const homepage = readSource("components/features/home/feature-blocks.tsx");
    const transcript = readSource(
      "components/features/studio/interviews/interview-detail/conversation-transcript.tsx",
    );

    const lightweightImport = 'from "@/components/ai-elements/message-primitives"';
    // 首页现在用自绘的语音气泡，不再需要消息组件；只约束它不能引入富文本消息模块。
    // The homepage now draws its own voice bubbles; it only must not pull in the rich message module.
    expect(transcript).toContain(lightweightImport);
    expect(homepage).not.toContain('from "@/components/ai-elements/message"');
    expect(transcript).not.toContain('from "@/components/ai-elements/message"');
  });

  it("preserves the existing message module exports for rich-message callers", () => {
    const message = readSource("components/ai-elements/message.tsx");

    expect(message).toContain('from "./message-primitives"');
    expect(message).toContain("MessageResponse");
  });
});
