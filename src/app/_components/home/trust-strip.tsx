// 用途：将原 4 张特性卡缩成一条小标签条，作为 Hero 下的速览
// Purpose: collapse the original 4 feature cards into a slim label row under Hero.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { ResumeRadarIcon, RoleContextIcon, VoiceInterviewIcon, WorkflowLinkIcon } from "./icons";

const items = [
  { Icon: ResumeRadarIcon, label: "聊天式简历初筛" },
  { Icon: RoleContextIcon, label: "岗位语境驱动" },
  { Icon: VoiceInterviewIcon, label: "语音模拟面试" },
  { Icon: WorkflowLinkIcon, label: "筛选到面试联动" },
];

export function TrustStrip() {
  return (
    <FadeContent className="mt-8 sm:mt-10" delay={0.3}>
      <ul className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-foreground/70 text-xs sm:gap-x-10 sm:text-sm">
        {items.map(({ Icon, label }) => (
          <li className="inline-flex items-center gap-2" key={label}>
            <span className="inline-flex size-7 items-center justify-center rounded-lg border border-primary/15 bg-primary/8 text-primary">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="font-medium">{label}</span>
          </li>
        ))}
      </ul>
    </FadeContent>
  );
}
