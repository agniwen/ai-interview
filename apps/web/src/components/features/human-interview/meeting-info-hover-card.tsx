"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

const meetingTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "long",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export function MeetingInfoHoverCard({
  jobDescriptionName,
  meetingTitle,
  responsibleHrImage,
  responsibleHrName,
  roundLabel,
  scheduledAt,
  showResponsibleHr,
}: {
  jobDescriptionName: string | null | undefined;
  meetingTitle: string;
  responsibleHrImage: string | null | undefined;
  responsibleHrName: string | null | undefined;
  roundLabel: string | undefined;
  scheduledAt: string | null | undefined;
  showResponsibleHr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const meetingTime =
    date && Number.isFinite(date.getTime()) ? meetingTimeFormatter.format(date) : "待确认";
  const details = [
    ["岗位名称", jobDescriptionName?.trim() || "待确认"],
    ["面试轮次", roundLabel?.trim() || "待确认"],
    ["会议时间", meetingTime],
  ] as const;

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        render={
          <button
            aria-label={`会议信息：${meetingTitle}`}
            className="-ml-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-left font-medium text-foreground text-sm whitespace-nowrap hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => setOpen(true)}
            type="button"
          >
            <span>会议信息</span>
            <IconInfoCircle aria-hidden="true" className="size-4 shrink-0" />
          </button>
        }
      />
      <HoverCardContent align="start" className="w-72 max-w-[calc(100vw-1rem)] p-4" sideOffset={8}>
        <h2 className="mb-3 font-medium text-sm">会议信息</h2>
        <dl className="space-y-3 text-sm">
          {details.map(([label, value]) => (
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-foreground">{value}</dd>
            </div>
          ))}
          {showResponsibleHr ? (
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">负责 HR</dt>
              <dd className="inline-flex min-w-0 items-center gap-1.5 break-words text-foreground">
                {responsibleHrName?.trim() ? (
                  <Avatar className="size-[18px]">
                    {responsibleHrImage ? (
                      <AvatarImage alt={responsibleHrName} src={responsibleHrImage} />
                    ) : null}
                    <AvatarFallback className="text-[9px]">
                      {responsibleHrName.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                ) : null}
                <span>{responsibleHrName?.trim() || "未记录"}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}
