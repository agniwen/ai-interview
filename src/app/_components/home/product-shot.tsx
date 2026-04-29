// 用途：Hero 下方的产品主截图大图
// Purpose: Hero shot of the primary product surface.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { Screenshot } from "./screenshot";
import { Section } from "./section";

export function ProductShot() {
  return (
    <Section className="!py-16 sm:!py-20" width="wide">
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
