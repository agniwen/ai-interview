"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@arc/shared/utils";
import { ANIMATED_HEIGHT_COMPLETE_EVENT } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";

export function InterviewReportDetailsDisclosure({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!expanded) {
      return;
    }
    const details = detailsRef.current;
    const scrollToDetails = () => {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    };
    const animatedHeight = details?.closest<HTMLElement>('[data-slot="animated-height"]');
    if (!animatedHeight) {
      scrollToDetails();
      return;
    }
    animatedHeight.addEventListener(ANIMATED_HEIGHT_COMPLETE_EVENT, scrollToDetails, {
      once: true,
    });
    return () =>
      animatedHeight.removeEventListener(ANIMATED_HEIGHT_COMPLETE_EVENT, scrollToDetails);
  }, [expanded]);

  return (
    <>
      <div className="flex justify-center">
        <Button
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {expanded ? "收起更多信息" : "展示详细分析结果"}
          <IconChevronDown
            className={cn("transition-transform", expanded ? "rotate-180" : undefined)}
          />
        </Button>
      </div>
      {expanded ? <div ref={detailsRef}>{children}</div> : null}
    </>
  );
}
