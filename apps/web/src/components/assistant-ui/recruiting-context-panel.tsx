"use client";

import { IconChevronRight, IconExternalLink, IconX } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cossPopupSurfaceClass } from "@/components/ui/coss-style";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useRecruitingCopilotContext } from "./recruiting-copilot-context";
import type {
  CopilotCitation,
  ProposalStatus,
  RecruitingActionProposal,
} from "./recruiting-copilot-context";

function CitationList({ citations }: { citations: CopilotCitation[] }) {
  const slug = useWorkspaceSlug();
  const { openCandidateDetail } = useRecruitingCopilotContext();
  if (citations.length === 0) {
    return <p className="text-muted-foreground text-sm">当前会话还没有引用系统记录。</p>;
  }
  return (
    <div className="grid gap-2">
      {citations.map((citation) => {
        const content = (
          <>
            <span className="min-w-0">
              <span className="block truncate font-medium">{citation.label}</span>
              <span className="block truncate text-muted-foreground text-xs">
                {citation.secondaryLabel ?? citation.recordType}
              </span>
            </span>
            {citation.recordType === "job_description" ? (
              <IconExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
            ) : (
              <IconChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
            )}
          </>
        );
        const className =
          "group flex min-w-0 items-start justify-between gap-2 rounded-lg border border-transparent bg-card px-3 py-2 text-left text-sm shadow-default transition-colors hover:bg-(--gray-2) dark:hover:bg-(--gray-3) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
        const key = `${citation.recordType}:${citation.id}`;

        if (citation.recordType === "job_description") {
          return (
            <a className={className} href={`/w/${slug}/studio/job-descriptions`} key={key}>
              {content}
            </a>
          );
        }

        return (
          <button
            className={className}
            key={key}
            onClick={() =>
              openCandidateDetail({
                id: citation.id,
                kind: citation.recordType === "resume_pool_item" ? "resume_pool" : "resume_record",
              })
            }
            type="button"
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function ProposalList({
  proposals,
  statuses,
}: {
  proposals: RecruitingActionProposal[];
  statuses: Record<string, ProposalStatus>;
}) {
  if (proposals.length === 0) {
    return <p className="text-muted-foreground text-sm">暂无待确认动作。</p>;
  }
  return (
    <div className="grid gap-2">
      {proposals.map((proposal) => (
        <div
          className="rounded-lg border border-transparent bg-card px-3 py-2 text-sm shadow-default"
          key={proposal.id}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{proposal.title}</p>
            <Badge className="shrink-0" variant="outline">
              {statuses[proposal.id] ?? "pending"}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">{proposal.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function ContextPanelContent() {
  const { citations, proposalStatuses, proposals } = useRecruitingCopilotContext();
  const pendingCount = proposals.filter(
    (proposal) => (proposalStatuses[proposal.id] ?? "pending") === "pending",
  ).length;
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="font-medium text-muted-foreground text-xs">引用记录</h3>
        <div className="mt-2">
          <CitationList citations={citations} />
        </div>
      </section>
      <section>
        <h3 className="font-medium text-muted-foreground text-xs">检索范围</h3>
        <div className="mt-2 rounded-lg border border-transparent bg-card px-3 py-2 text-sm shadow-default">
          <p>当前 workspace 招聘台与岗位库</p>
          <p className="mt-1 text-muted-foreground text-xs">
            已收集 {citations.length} 条引用，{pendingCount} 个动作待确认。
          </p>
        </div>
      </section>
      <section>
        <h3 className="font-medium text-muted-foreground text-xs">待确认动作</h3>
        <div className="mt-2">
          <ProposalList proposals={proposals} statuses={proposalStatuses} />
        </div>
      </section>
    </div>
  );
}

// 桌面面板常驻 DOM，用 data-open 驱动过渡：从触发按钮所在的右上角轻微缩放 + 淡入，
// 收起时更快（quick），与 coss 弹层的 250ms 开 / 150ms 关节奏一致。
const desktopPanelMotionClass =
  "origin-top-right transition-[scale,opacity,filter] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-[open=false]:pointer-events-none data-[open=false]:scale-(--scale-medium) data-[open=false]:opacity-0 data-[open=false]:blur-(--blur-small) data-[open=false]:duration-[var(--duration-quick)] motion-reduce:transition-none";

const desktopTriggerMotionClass =
  "transition-[scale,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-[open=true]:pointer-events-none data-[open=true]:scale-(--scale-small) data-[open=true]:opacity-0 data-[open=true]:duration-[var(--duration-quick)] motion-reduce:transition-none";

// 常驻面板属于静止表面：与输入框、卡片同用 shadow-default，不用弹层的 shadow-large。
const residentPanelSurfaceClass =
  "rounded-xl bg-popover text-popover-foreground shadow-default outline-none";

const floatingTopClass = "top-[calc(var(--header-height)+1rem)]";

export function RecruitingContextPanel() {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopCloseRef = useRef<HTMLButtonElement>(null);

  // 面板与触发按钮互斥可聚焦（inert），先同步提交状态再移交焦点。
  const toggleDesktop = (open: boolean) => {
    flushSync(() => setDesktopOpen(open));
    (open ? desktopCloseRef : desktopTriggerRef).current?.focus();
  };

  return (
    <>
      <Button
        aria-label="展开上下文"
        className={cn(
          "absolute right-4 z-20 hidden lg:inline-flex",
          floatingTopClass,
          desktopTriggerMotionClass,
        )}
        data-open={desktopOpen}
        inert={desktopOpen}
        onClick={() => toggleDesktop(true)}
        ref={desktopTriggerRef}
        type="button"
        variant="outline"
      >
        <IconExternalLink className="size-4" />
        上下文
      </Button>
      <aside
        aria-label="上下文"
        className={cn(
          residentPanelSurfaceClass,
          "absolute right-4 z-30 hidden max-h-[calc(100%-var(--header-height)-2rem)] w-80 flex-col overflow-hidden lg:flex",
          floatingTopClass,
          desktopPanelMotionClass,
        )}
        data-open={desktopOpen}
        data-slot="recruiting-context-panel"
        inert={!desktopOpen}
      >
        <div className="flex h-11 shrink-0 items-center justify-between ps-4 pe-2">
          <h2 className="font-medium text-[13px]">上下文</h2>
          <Button
            aria-label="收起上下文"
            className="size-7"
            onClick={() => toggleDesktop(false)}
            ref={desktopCloseRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconX className="size-4" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1" scrollFade>
          <div className="px-4 pt-1 pb-4">
            <ContextPanelContent />
          </div>
        </ScrollArea>
      </aside>
      <Button
        className={cn("absolute right-4 z-30 lg:hidden", floatingTopClass)}
        onClick={() => setMobileOpen(true)}
        type="button"
        variant="outline"
      >
        上下文
      </Button>
      <div
        aria-hidden={!mobileOpen}
        className="absolute inset-0 z-40 bg-background/80 opacity-100 backdrop-blur-sm transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)] data-[open=false]:pointer-events-none data-[open=false]:opacity-0 data-[open=false]:duration-[var(--duration-medium)] motion-reduce:transition-none lg:hidden"
        data-open={mobileOpen}
        data-slot="recruiting-context-mobile-overlay"
        inert={!mobileOpen}
      >
        <div
          className={cn(
            cossPopupSurfaceClass,
            "t-panel-slide absolute inset-x-3 bottom-20 flex max-h-[70vh] flex-col overflow-hidden",
          )}
          data-open={mobileOpen}
          data-slot="recruiting-context-mobile-panel"
        >
          <div className="flex h-11 shrink-0 items-center justify-between ps-4 pe-2">
            <h2 className="font-medium text-[13px]">上下文</h2>
            <Button
              aria-label="关闭上下文"
              className="size-7"
              onClick={() => setMobileOpen(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <IconX className="size-4" />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1" scrollFade>
            <div className="px-4 pt-1 pb-4">
              <ContextPanelContent />
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
