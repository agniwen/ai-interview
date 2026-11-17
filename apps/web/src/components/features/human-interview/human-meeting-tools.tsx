import { useCallback } from "react";
import type { ReactNode } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { HumanMeetingToolPanel } from "./human-meeting-tool-panel";

export type MeetingTool = "chat" | "transcript" | "questions";

export function HumanMeetingTools({
  tool,
  onChange,
  chat,
  transcript,
  questions,
}: {
  tool: MeetingTool | null;
  onChange: (tool: MeetingTool | null) => void;
  chat: ReactNode;
  transcript?: ReactNode;
  questions?: ReactNode;
}) {
  const close = useCallback(() => onChange(null), [onChange]);
  return (
    <HumanMeetingToolPanel
      desktopClassName="h-[38.4rem] w-[28.8rem] max-w-[calc(100%-1.5rem)]"
      open={tool !== null}
      onClose={close}
      title="会议工具"
      closeLabel="关闭会议工具"
      slot="meeting-tools-panel"
    >
      <Tabs className="min-h-0 flex-1" value={tool ?? "chat"} onValueChange={onChange}>
        <TabsList className="mx-3 shrink-0" variant="line">
          {questions ? <TabsTab value="questions">面试题</TabsTab> : null}
          {transcript ? <TabsTab value="transcript">字幕</TabsTab> : null}
          <TabsTab value="chat">聊天</TabsTab>
        </TabsList>
        {questions ? (
          <TabsPanel className="flex min-h-0 flex-1 flex-col" keepMounted value="questions">
            {questions}
          </TabsPanel>
        ) : null}
        {transcript ? (
          <TabsPanel className="flex min-h-0 flex-1 flex-col" keepMounted value="transcript">
            {transcript}
          </TabsPanel>
        ) : null}
        <TabsPanel className="flex min-h-0 flex-1 flex-col" keepMounted value="chat">
          {chat}
        </TabsPanel>
      </Tabs>
    </HumanMeetingToolPanel>
  );
}
