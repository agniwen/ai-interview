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
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@app/shared/utils";
import { useDemo } from "./demo-context";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { DEMO_CANDIDATE_ID } from "./demo-workflow-data";

/** Same dot-and-label treatment as the live agent indicator, with localized demo copy. */
function DemoStateIndicator({ className, speaking }: { className?: string; speaking: boolean }) {
  const { agentState } = getDemoScreenCopy();
  const dotClass = speaking ? "bg-green-500" : "bg-blue-500";
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 font-medium text-muted-foreground text-sm",
        className,
      )}
    >
      <span className="relative flex size-2.5">
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            dotClass,
          )}
        />
        <span className={cn("relative inline-flex size-2.5 rounded-full", dotClass)} />
      </span>
      <span>{speaking ? agentState.speaking : agentState.listening}</span>
    </div>
  );
}

/** Uses the real session visualizer, state indicator, and transcript message primitives, without a room connection. */
export default function DemoLiveInterview() {
  const demo = useDemo();
  const { conversation, job, liveInterview: copy, people } = getDemoScreenCopy();
  const turn = conversation[demo.turn];
  return (
    <div
      className="relative h-full w-full bg-background"
      data-slot="demo-live-interview"
      data-candidate-id={DEMO_CANDIDATE_ID}
    >
      <Badge className="absolute top-4 left-4 z-20 tabular-nums" variant="outline">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {["03:12", "09:24", "18:36"][demo.turn]}
      </Badge>
      <div className="absolute top-4 right-6 z-20 text-xs text-muted-foreground">
        {people.candidate} · {job.title} · {copy.roundLabel}
      </div>
      <div className="absolute inset-y-0 left-0 flex w-[65%] items-center justify-center">
        <AgentAudioVisualizerAura
          className="size-[340px]"
          state={demo.turn % 2 ? "listening" : "speaking"}
          color="#1d4ed8"
        />
      </div>
      <div className="absolute right-8 top-20 bottom-40 w-[33%] rounded-xl border bg-background/90 p-4">
        <h2 className="mb-4 text-sm font-medium">{copy.transcript}</h2>
        <ScrollArea className="h-[480px]" scrollbars="leave">
          <div className="space-y-6">
            {conversation.slice(0, demo.turn + 1).map((entry) => (
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
      <DemoStateIndicator
        className="absolute bottom-[118px] left-0 w-full"
        speaking={demo.turn % 2 === 0}
      />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-[31px] border border-input/50 bg-background p-3">
        <div className="flex items-center gap-3">
          {[
            { icon: IconMicrophone, label: copy.microphone },
            { icon: IconVideo, label: copy.camera },
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
                aria-label={copy.deviceSettings(label)}
              >
                <IconChevronDown className="size-3" />
              </Button>
            </div>
          ))}
          <Button
            size="icon"
            variant="outline"
            className="rounded-full bg-primary/10 text-primary"
            aria-label={copy.transcript}
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
            {copy.endInterview}
          </Button>
        </div>
      </div>
      <span className="sr-only">{turn.question}</span>
    </div>
  );
}
