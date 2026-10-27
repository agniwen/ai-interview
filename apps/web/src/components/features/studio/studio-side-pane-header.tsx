"use client";

import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { STUDIO_SIDE_PANE_TITLE_ID, useStudioSidePaneController } from "./studio-side-pane-context";

export function StudioSidePaneHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const { close } = useStudioSidePaneController();
  return (
    <div className="flex h-[var(--header-height,3rem)] shrink-0 items-center justify-between gap-2 px-4">
      <h2 id={STUDIO_SIDE_PANE_TITLE_ID} className="truncate font-normal text-sm">
        {title}
      </h2>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <Button aria-label={`关闭${title}`} onClick={close} size="icon-sm" variant="ghost">
          <IconX className="size-4" />
        </Button>
      </div>
    </div>
  );
}
