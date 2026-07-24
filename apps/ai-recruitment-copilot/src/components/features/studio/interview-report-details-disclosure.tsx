"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@arc/shared/utils";
import { Button } from "@/components/ui/button";

export function InterviewReportDetailsDisclosure({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

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
          {expanded ? "收起更多信息" : "展示更多信息"}
          <IconChevronDown
            className={cn("transition-transform", expanded ? "rotate-180" : undefined)}
          />
        </Button>
      </div>
      {expanded ? children : null}
    </>
  );
}
