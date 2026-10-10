import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { HumanMeetingFloatingPanel } from "./human-meeting-floating-panel";
import { IconFileDescription, IconX } from "@tabler/icons-react";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@app/shared/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

const CandidateMaterials = lazy(async () => {
  const candidateMaterials = await import("./interviewer-candidate-materials");
  return { default: candidateMaterials.InterviewerCandidateMaterials };
});

function transcriptTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function MaterialsPanel({
  open,
  isMobile,
  onClose,
  children,
}: {
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || isMobile) {
      return;
    }
    const previous = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [open, isMobile, onClose]);
  const content = (
    <>
      <div className="flex shrink-0 items-center justify-between p-4">
        {isMobile ? (
          <DrawerTitle>候选人资料</DrawerTitle>
        ) : (
          <h2 className="font-semibold">候选人资料</h2>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="关闭候选人资料" onClick={onClose}>
          <IconX />
        </Button>
      </div>
      {children}
    </>
  );
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()} direction="bottom">
        <DrawerContent
          hideHandle
          aria-describedby={undefined}
          className="h-dvh overflow-hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh"
        >
          {content}
        </DrawerContent>
      </Drawer>
    );
  }
  if (!open) {
    return null;
  }
  return createPortal(
    <HumanMeetingFloatingPanel
      open={open}
      ref={panelRef}
      tabIndex={-1}
      aria-label="候选人资料"
      className="fixed inset-y-0 right-0 bottom-0 h-dvh max-h-none w-[min(46vw,44rem)] rounded-none border-y-0 border-r-0 animate-in slide-in-from-right duration-200 motion-reduce:animate-none"
    >
      {content}
    </HumanMeetingFloatingPanel>,
    document.body,
  );
}

export function HumanMeetingReviewMaterials({
  inviteToken,
  transcript,
  currentReviewerId,
  interviewers = [],
  onDesktopOpenChange,
}: {
  inviteToken: string;
  onDesktopOpenChange?: (open: boolean) => void;
  currentReviewerId?: string;
  interviewers?: HumanInterviewReviewRecord["transcriptInterviewers"];
  transcript: HumanInterviewReviewRecord["transcript"];
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const closePanel = useCallback(() => setOpen(false), []);
  useEffect(() => {
    onDesktopOpenChange?.(open && !isMobile);
  }, [open, isMobile, onDesktopOpenChange]);
  const [state, setState] = useState<InterviewerCandidateMaterialsState>({
    candidateId: null,
    questionsOpen: false,
  });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <IconFileDescription data-icon="inline-start" />
        查看候选人资料
      </Button>
      <MaterialsPanel open={open} isMobile={isMobile} onClose={closePanel}>
        {open ? (
          <Tabs defaultValue="overview" className="min-h-0 flex-1 px-4 pb-4">
            <TabsList aria-label="候选人资料内容">
              <TabsTrigger value="overview">面试概览与简历</TabsTrigger>
              <TabsTrigger value="transcript">面试转录</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="min-h-0 flex-1 overflow-hidden">
              <Suspense
                fallback={<p className="p-4 text-muted-foreground text-sm">正在加载候选人资料…</p>}
              >
                <CandidateMaterials
                  active
                  showTimeline={false}
                  inviteToken={inviteToken}
                  state={state}
                  onStateChange={setState}
                />
              </Suspense>
            </TabsContent>
            <TabsContent value="transcript" className="min-h-0 flex-1 overflow-hidden">
              {transcript?.turns.length ? (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-5 py-3">
                    {transcript.turns.map((turn) => {
                      const interviewer =
                        turn.attribution?.role === "interviewer"
                          ? interviewers.find(
                              (item) =>
                                turn.attribution?.participantIdentity ===
                                `interviewer_${item.userId}`,
                            )
                          : undefined;
                      const isSelf = Boolean(
                        currentReviewerId &&
                        turn.attribution?.role === "interviewer" &&
                        turn.attribution.participantIdentity === `interviewer_${currentReviewerId}`,
                      );
                      return (
                        <div
                          key={turn.id}
                          className={cn("flex flex-col items-start gap-1.5", isSelf && "items-end")}
                          data-speaker-side={isSelf ? "self" : "other"}
                        >
                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            {interviewer?.image ? (
                              <Avatar
                                className="size-[14px]"
                                generatedSize={14}
                                label={`${interviewer.name}的头像`}
                                seed={`user:${interviewer.userId}`}
                              >
                                <AvatarImage src={interviewer.image} alt={interviewer.name} />
                              </Avatar>
                            ) : null}
                            <span>
                              {interviewer
                                ? `面试官 · ${interviewer.name}${isSelf ? "（我）" : ""}`
                                : turn.speakerDisplayName || "未命名发言人"}
                            </span>
                            <span className="tabular-nums">
                              {transcriptTime(turn.startMs)} – {transcriptTime(turn.endMs)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm leading-6",
                              isSelf &&
                                "rounded-tl-2xl rounded-tr-sm bg-primary text-primary-foreground",
                            )}
                          >
                            {turn.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <p className="p-4 text-muted-foreground text-sm">暂无可查看的面试转录。</p>
              )}
            </TabsContent>
          </Tabs>
        ) : null}
      </MaterialsPanel>
    </>
  );
}
