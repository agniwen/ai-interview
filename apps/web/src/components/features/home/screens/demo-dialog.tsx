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
import { demoConversation } from "./demo-workflow-data";
import { cn } from "@app/shared/utils";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { useDemo } from "./demo-context";

/** Only the invitation and scheduling scenes used by the tour are mounted. */
export function DemoDialogLayer() {
  const demo = useDemo();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { dialog } = demo;
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
            <Dialog.Backdrop className="pointer-events-auto absolute inset-0 bg-foreground/20 backdrop-blur-xs" />
            <Dialog.Popup
              initialFocus={false}
              finalFocus={false}
              className={cn(
                "pointer-events-auto absolute top-1/2 left-1/2 flex max-h-[760px] w-[780px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
                dialog.kind === "resume" && "w-[1180px] h-[760px]",
              )}
              data-slot="demo-dialog"
            >
              <header className="flex items-start justify-between gap-4 border-b p-6">
                <div>
                  <Dialog.Title className="text-xl font-medium">{dialog.title}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                    真嗣 · 技术部 / 资深前端工程师
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  render={
                    <Button
                      data-demo-dialog-close
                      aria-label="关闭演示弹窗"
                      size="icon-sm"
                      variant="ghost"
                    />
                  }
                >
                  <IconX />
                </Dialog.Close>
              </header>
              <ScrollArea className="min-h-0 max-h-[540px]" scrollbars="leave">
                <div className="space-y-5 p-6">
                  {dialog.kind === "resume" && (
                    <div className="mx-auto max-w-4xl">
                      <h2 className="mb-5 text-2xl font-semibold">真嗣 · 资深前端工程师</h2>
                      <Badge variant="outline" className="mb-5">
                        结构化简历
                      </Badge>
                      {demo.candidate?.profile && (
                        <ResumeProfileView profile={demo.candidate.profile} />
                      )}
                    </div>
                  )}
                  {dialog.kind === "launch" && (
                    <>
                      <Tabs value="questions">
                        <TabsList>
                          <TabsTrigger value="questions">面试题目</TabsTrigger>
                          <TabsTrigger value="overview">简历概览</TabsTrigger>
                          <TabsTrigger value="experience">工作经历</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">AI 面试题目</p>
                        <Badge variant="success">已生成 · 3 道</Badge>
                      </div>
                      {demoConversation.map((entry, i) => (
                        <Frame key={entry.question}>
                          <FrameHeader>
                            <FrameTitle>
                              问题 {i + 1} · {i ? "技术深度" : "项目经历"}
                            </FrameTitle>
                          </FrameHeader>
                          <FramePanel className="py-4 text-sm leading-6">
                            {entry.question}
                          </FramePanel>
                        </Frame>
                      ))}
                      <div>
                        <Label htmlFor="demo-invitation">候选人专属面试链接</Label>
                        <Input
                          id="demo-invitation"
                          className="mt-2"
                          readOnly
                          value="interview.example.com/i/shinji-01842"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          有效期：7 天 · 已发起第 1 轮 AI 初面
                        </p>
                      </div>
                    </>
                  )}
                  {dialog.kind === "schedule" && (
                    <div className="grid grid-cols-2 gap-5">
                      {[
                        { label: "面试名称", value: "技术复面" },
                        { label: "面试形式", value: "视频面试" },
                        { label: "开始时间", value: "2026/10/09 14:00" },
                        { label: "结束时间", value: "2026/10/09 15:00" },
                        { label: "面试官", value: "赤木律子" },
                        { label: "关联候选人", value: "真嗣 (01842)" },
                      ].map((field) => (
                        <div key={field.label}>
                          <Label>{field.label}</Label>
                          <Input className="mt-2" readOnly value={field.value} />
                        </div>
                      ))}
                      <Frame className="col-span-2">
                        <FrameHeader>
                          <FrameTitle>面试重点</FrameTitle>
                        </FrameHeader>
                        <FramePanel className="text-sm leading-6">
                          围绕 AI
                          初面已确认的项目证据，验证架构设计、灰度回滚和性能指标采集。候选人及面试官均已确认本次安排。
                        </FramePanel>
                      </Frame>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <footer className="flex justify-end gap-3 border-t p-4">
                <Dialog.Close render={<Button variant="outline" />}>关闭</Dialog.Close>
                {dialog.kind === "launch" && (
                  <Button
                    data-demo-enter-interview
                    onClick={() => {
                      demo.setDialog(null);
                      demo.setPhase("live");
                    }}
                  >
                    查看候选人面试页面
                  </Button>
                )}
                {dialog.kind === "schedule" && <Button disabled>保存安排</Button>}
              </footer>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </>
  );
}
