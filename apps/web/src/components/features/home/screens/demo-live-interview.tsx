"use client";

import {
  IconChevronDown,
  IconMessage2,
  IconMicrophone,
  IconPhoneOff,
  IconUser,
  IconVideo,
} from "@tabler/icons-react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import { AgentStateIndicator } from "@/components/agents-ui/blocks/agent-session-view-01/components/agent-state-indicator";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { demoConversation } from "./demo-workflow-data";
import { useDemo } from "./demo-context";

/** Uses the real session visualizer, state indicator, and transcript message primitives, without a room connection. */
export default function DemoLiveInterview() {
  const demo = useDemo();
  const turn = demoConversation[demo.turn];
  return (
    <div
      className="relative h-full w-full bg-background"
      data-slot="demo-live-interview"
      data-candidate-id="01842"
    >
      <Badge className="absolute top-4 left-4 z-20 tabular-nums" variant="outline">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {["03:12", "09:24", "18:36"][demo.turn]}
      </Badge>
      <div className="absolute top-4 right-6 z-20 text-xs text-muted-foreground">
        真嗣 · 资深前端工程师 · AI 初面
      </div>
      <div className="absolute inset-y-0 left-0 flex w-[65%] items-center justify-center">
        <AgentAudioVisualizerAura
          className="size-[340px]"
          state={demo.turn % 2 ? "listening" : "speaking"}
          color="#1d4ed8"
        />
      </div>
      <div className="absolute right-8 top-20 bottom-40 w-[33%] rounded-xl border bg-background/90 p-4">
        <h2 className="mb-4 text-sm font-medium">对话记录</h2>
        <ScrollArea className="h-[520px]" scrollbars="leave">
          <div className="space-y-6">
            {demoConversation.slice(0, demo.turn + 1).map((entry) => (
              <div key={entry.question}>
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse>{entry.question}</MessageResponse>
                  </MessageContent>
                </Message>
                <Message from="user">
                  <MessageContent>
                    <MessageResponse>{entry.answer}</MessageResponse>
                  </MessageContent>
                </Message>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="absolute bottom-44 right-[38%] grid size-[90px] place-items-center rounded-md bg-muted shadow-lg">
        <IconUser className="size-8 text-muted-foreground/60" />
      </div>
      <AgentStateIndicator
        className="absolute bottom-[118px] left-0 w-full"
        state={demo.turn % 2 ? "listening" : "speaking"}
      />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-[31px] border border-input/50 bg-background p-3">
        <div className="flex items-center gap-3">
          {[
            { icon: IconMicrophone, label: "麦克风" },
            { icon: IconVideo, label: "摄像头" },
          ].map(({ icon: Icon, label }) => (
            <div className="flex" key={label}>
              <Button
                size="icon"
                variant="outline"
                className="rounded-l-full rounded-r-none"
                aria-label={label}
              >
                <Icon />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="w-7 rounded-l-none rounded-r-full border-l-0"
                aria-label={`${label}设置`}
              >
                <IconChevronDown className="size-3" />
              </Button>
            </div>
          ))}
          <Button
            size="icon"
            variant="outline"
            className="rounded-full bg-primary/10 text-primary"
            aria-label="对话记录"
            data-demo-next-turn
            onClick={() => demo.setTurn(Math.min(demo.turn + 1, 2))}
          >
            <IconMessage2 />
          </Button>
          <Button
            className="rounded-full bg-destructive/5 font-mono text-xs font-bold text-destructive/80"
            variant="ghost"
            data-demo-finish-ai
            onClick={() => demo.setPhase("ai-completed")}
          >
            <IconPhoneOff className="size-3.5" />
            结束面试
          </Button>
        </div>
      </div>
      <span className="sr-only">{turn.question}</span>
    </div>
  );
}
