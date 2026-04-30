// 用途：Hero 下方的产品主截图大图
// Purpose: Hero shot of the primary product surface.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { Screenshot } from "./screenshot";
import { Section } from "./section";

// 顶部小 padding 让截图露出首屏一半，底部沿用 Section 默认节奏与下方 section 对齐
// Small top keeps the screenshot peeking above the fold; default bottom keeps section rhythm consistent.
export function ProductShot() {
  return (
    <Section className="!pt-8 sm:!pt-10" width="wide">
      <FadeContent>
        <Screenshot
          alt="工作台主界面预览"
          darkSrc="/landing/studio-dark.png"
          height={900}
          lightSrc="/landing/studio-light.png"
          priority
          width={1440}
        />
      </FadeContent>
    </Section>
  );
}
