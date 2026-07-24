"use client";

import { IconExternalLink, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useRecruitingCopilotContext } from "./recruiting-copilot-context";
import type {
  CopilotCitation,
  ProposalStatus,
  RecruitingActionProposal,
} from "./recruiting-copilot-context";

function citationHref(slug: string, citation: CopilotCitation) {
  if (citation.recordType === "job_description") {
    return `/w/${slug}/studio/job-descriptions`;
  }
  if (citation.recordType === "resume_pool_item") {
    return `/w/${slug}/studio/resume-pool`;
  }
  return `/w/${slug}/studio/resumes`;
}

function CitationList({ citations }: { citations: CopilotCitation[] }) {
  const slug = useWorkspaceSlug();
  if (citations.length === 0) {
    return <p className="text-muted-foreground text-sm">当前会话还没有引用系统记录。</p>;
  }
  return (
    <div className="grid gap-2">
      {citations.map((citation) => (
        <a
          className="group flex min-w-0 items-start justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
          href={citationHref(slug, citation)}
          key={`${citation.recordType}:${citation.id}`}
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{citation.label}</span>
            <span className="block truncate text-muted-foreground text-xs">
              {citation.secondaryLabel ?? citation.recordType}
            </span>
          </span>
          <IconExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        </a>
      ))}
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
        <div className="rounded-lg border bg-background px-3 py-2 text-sm" key={proposal.id}>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{proposal.title}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
              {statuses[proposal.id] ?? "pending"}
            </span>
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
    <div className="space-y-5">
      <section>
        <h2 className="font-medium text-sm">引用记录</h2>
        <div className="mt-2">
          <CitationList citations={citations} />
        </div>
      </section>
      <section>
        <h2 className="font-medium text-sm">检索范围</h2>
        <div className="mt-2 rounded-lg border bg-background px-3 py-2 text-sm">
          <p>当前 workspace 招聘台与岗位库</p>
          <p className="mt-1 text-muted-foreground text-xs">
            已收集 {citations.length} 条引用，{pendingCount} 个动作待确认。
          </p>
        </div>
      </section>
      <section>
        <h2 className="font-medium text-sm">待确认动作</h2>
        <div className="mt-2">
          <ProposalList proposals={proposals} statuses={proposalStatuses} />
        </div>
      </section>
    </div>
  );
}

export function RecruitingContextPanel() {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      {desktopOpen ? (
        <aside className="absolute top-4 right-4 bottom-4 z-30 hidden w-80 overflow-hidden rounded-xl border bg-background/95 shadow-sm backdrop-blur lg:flex">
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
              <h2 className="font-medium text-sm">上下文</h2>
              <Button
                aria-label="收起上下文"
                className="ms-auto size-8"
                onClick={() => setDesktopOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconX className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <ContextPanelContent />
            </div>
          </div>
        </aside>
      ) : (
        <Button
          aria-label="展开上下文"
          className="absolute top-4 right-4 z-30 hidden h-9 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur lg:inline-flex"
          onClick={() => setDesktopOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconExternalLink className="size-4" />
          上下文
        </Button>
      )}
      <Button
        className="absolute top-4 right-4 z-30 h-9 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur lg:hidden"
        onClick={() => setMobileOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        上下文
      </Button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-x-3 bottom-20 max-h-[70vh] overflow-y-auto rounded-2xl border bg-background p-3 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-sm">上下文</h2>
              <Button
                aria-label="关闭上下文"
                className="size-8"
                onClick={() => setMobileOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconX className="size-4" />
              </Button>
            </div>
            <ContextPanelContent />
          </div>
        </div>
      ) : null}
    </>
  );
}
