"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconHeadphones,
  IconMessages,
  IconPlugConnected,
  IconUserCheck,
  IconVideo,
} from "@tabler/icons-react";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { interviewSolidButtonClass } from "./interview-button-styles";

interface NoticeItem {
  icon: TablerIcon;
  text: string;
}

export function buildInterviewNoticeItems(recordingEnabled: boolean): NoticeItem[] {
  return [
    {
      icon: IconMessages,
      text: "请自然交流，等面试官说完再作答；没听清可以请它重复或换个问法。",
    },
    {
      icon: IconPlugConnected,
      text: "如遇连接中断，请在 3 分钟内重新打开本页面，可以接着之前的对话继续。",
    },
    {
      icon: IconUserCheck,
      text: "请用自己的话作答，结合真实经历；不确定的地方如实说明即可。",
    },
    recordingEnabled
      ? { icon: IconVideo, text: "本轮面试将录像，请保持摄像头开启，并选择安静的环境。" }
      : { icon: IconHeadphones, text: "建议佩戴耳机，在安静、网络稳定的环境中进行。" },
  ];
}

/** Last checkpoint before connecting: what to expect during the interview. */
export function InterviewNotice({
  busyLabel,
  onBack,
  onConfirm,
  recordingEnabled,
}: {
  busyLabel: string | null;
  onBack: () => void;
  onConfirm: () => void;
  recordingEnabled: boolean;
}) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center">
      <h1 className="font-medium text-xl tracking-tight">面试须知</h1>
      <p className="mt-2 text-muted-foreground text-sm">面试开始前，请先了解以下事项。</p>
      <ul className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
        {buildInterviewNoticeItems(recordingEnabled).map(({ icon: Icon, text }) => (
          <li
            className="flex gap-2.5 rounded-xl border border-transparent bg-card px-3.5 py-3 text-foreground/80 text-sm leading-6 shadow-default"
            key={text}
          >
            <Icon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
            {text}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Button
          className="sm:min-w-24"
          disabled={busyLabel !== null}
          onClick={onBack}
          type="button"
          variant="outline"
        >
          返回
        </Button>
        <Button
          className={cn(interviewSolidButtonClass, "sm:min-w-32")}
          disabled={busyLabel !== null}
          onClick={onConfirm}
          type="button"
        >
          {busyLabel ? <Spinner /> : null}
          {busyLabel ?? "开始面试"}
        </Button>
      </div>
    </div>
  );
}
