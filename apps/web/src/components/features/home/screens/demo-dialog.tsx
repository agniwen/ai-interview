"use client";

import { Dialog } from "@base-ui/react/dialog";
import { IconX } from "@tabler/icons-react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { cn } from "@app/shared/utils";
import { DemoResumeProfile } from "./_parts/demo-records";
import { useDemo } from "./demo-context";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { DEMO_CANDIDATE_ID, DEMO_INVITATION_URL } from "./demo-workflow-data";

/** Only the invitation and scheduling scenes used by the tour are mounted. */
export function DemoDialogLayer() {
  const demo = useDemo();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { dialog } = demo;
  const { conversation, dialog: copy, job, people } = getDemoScreenCopy();
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-40"
        ref={setContainer}
        data-slot="demo-overlay-host"
      />
      <Dialog.Root
        modal={false}
        open={Boolean(dialog)}
        onOpenChange={(open, details) => {
          if (!details.event?.isTrusted && !open) {
            demo.setDialog(null);
          }
        }}
      >
        {container && dialog && (
          <Dialog.Portal container={container}>
            <Dialog.Backdrop className="pointer-events-auto absolute inset-0 bg-background/80 backdrop-blur-xs" />
            <Dialog.Popup
              initialFocus={false}
              finalFocus={false}
              className={cn(
                "pointer-events-auto absolute top-1/2 left-1/2 flex max-h-[700px] w-[720px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-background shadow-extra-large",
                dialog.kind === "resume" && "w-[1080px] h-[720px]",
              )}
              data-slot="demo-dialog"
            >
              <header className="flex items-start justify-between gap-4 border-b p-6">
                <div>
                  <Dialog.Title className="text-xl font-medium">{dialog.title}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                    {people.candidate} · {job.label}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  render={
                    <Button
                      data-demo-dialog-close
                      aria-label={copy.closeLabel}
                      size="icon-sm"
                      variant="ghost"
                    />
                  }
                >
                  <IconX />
                </Dialog.Close>
              </header>
              <ScrollArea className="min-h-0 max-h-[500px]" scrollbars="leave">
                <div className="space-y-5 p-6" data-demo-reveal="dialog">
                  {dialog.kind === "resume" && (
                    <div className="mx-auto max-w-4xl">
                      <h2 className="mb-5 text-2xl font-semibold">
                        {people.candidate} · {job.title}
                      </h2>
                      <Badge variant="outline" className="mb-5">
                        {copy.structuredResume}
                      </Badge>
                      <DemoResumeProfile />
                    </div>
                  )}
                  {dialog.kind === "launch" && (
                    <>
                      <Tabs value="questions">
                        <TabsList>
                          <TabsTrigger value="questions">{copy.questionsTab}</TabsTrigger>
                          <TabsTrigger value="overview">{copy.overviewTab}</TabsTrigger>
                          <TabsTrigger value="experience">{copy.experienceTab}</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{copy.aiQuestions}</p>
                        <Badge variant="success">{copy.generated}</Badge>
                      </div>
                      {conversation.map((entry, i) => (
                        <Frame key={entry.question}>
                          <FrameHeader>
                            <FrameTitle>
                              {copy.questionLabel(i + 1, copy.questionKinds[i])}
                            </FrameTitle>
                          </FrameHeader>
                          <FramePanel className="py-4 text-sm leading-6">
                            {entry.question}
                          </FramePanel>
                        </Frame>
                      ))}
                      <div>
                        <Label htmlFor="demo-invitation">{copy.invitationLabel}</Label>
                        <Input
                          id="demo-invitation"
                          className="mt-2"
                          readOnly
                          value={DEMO_INVITATION_URL}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          {copy.invitationValidity}
                        </p>
                      </div>
                    </>
                  )}
                  {dialog.kind === "schedule" && (
                    <div className="grid grid-cols-2 gap-5">
                      {[
                        {
                          label: copy.scheduleFields.name,
                          value: getDemoScreenCopy().humanInterview.roundLabel,
                        },
                        {
                          label: copy.scheduleFields.format,
                          value: copy.scheduleFields.formatValue,
                        },
                        { label: copy.scheduleFields.start, value: "2026/10/09 14:00" },
                        { label: copy.scheduleFields.end, value: "2026/10/09 15:00" },
                        { label: copy.scheduleFields.interviewer, value: people.interviewer },
                        {
                          label: copy.scheduleFields.candidate,
                          value: `${people.candidate} (${DEMO_CANDIDATE_ID})`,
                        },
                      ].map((field) => (
                        <div key={field.label}>
                          <Label>{field.label}</Label>
                          <Input className="mt-2" readOnly value={field.value} />
                        </div>
                      ))}
                      <Frame className="col-span-2">
                        <FrameHeader>
                          <FrameTitle>{copy.scheduleFocusTitle}</FrameTitle>
                        </FrameHeader>
                        <FramePanel className="text-sm leading-6">
                          {copy.scheduleFocusBody}
                        </FramePanel>
                      </Frame>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <footer className="flex justify-end gap-3 border-t p-4">
                <Dialog.Close render={<Button variant="outline" />}>{copy.close}</Dialog.Close>
                {dialog.kind === "launch" && (
                  <Button
                    data-demo-enter-interview
                    onClick={() => {
                      demo.setDialog(null);
                      demo.setPhase("live");
                    }}
                  >
                    {copy.viewCandidatePage}
                  </Button>
                )}
                {dialog.kind === "schedule" && <Button disabled>{copy.saveSchedule}</Button>}
              </footer>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </>
  );
}
