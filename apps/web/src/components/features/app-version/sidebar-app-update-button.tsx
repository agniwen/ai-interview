"use client";

import { useState } from "react";
import { TimeDisplay } from "@/components/features/display/time-display";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function SidebarAppUpdateButton({ latestBuildTime }: { latestBuildTime: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="shrink-0 rounded-full px-2.5"
            size="xs"
            type="button"
            variant="default"
          >
            更新
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-3 text-xs" side="top" sideOffset={8}>
        <PopoverHeader className="gap-0.5">
          <PopoverTitle className="text-xs">刷新更新？</PopoverTitle>
          <PopoverDescription className="text-[11px] leading-snug">
            新版本
            {latestBuildTime ? (
              <>
                （<TimeDisplay as="span" value={latestBuildTime} />）
              </>
            ) : null}
            ，未保存内容可能丢失。
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-2.5 flex justify-end gap-1.5">
          <Button
            className="rounded-full"
            onClick={() => setOpen(false)}
            size="xs"
            type="button"
            variant="ghost"
          >
            取消
          </Button>
          <Button
            className="rounded-full"
            onClick={() => window.location.reload()}
            size="xs"
            type="button"
          >
            刷新
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
