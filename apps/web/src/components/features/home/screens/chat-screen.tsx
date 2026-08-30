import { IconArrowUp, IconBriefcase, IconSparkles, IconUsers } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { AppShell, ChatNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ current: true, label: "招聘协作" }];

const CANDIDATES = [
  {
    fit: "高匹配",
    name: "李铭",
    note: "React 架构和性能治理经验最完整，建议优先进入 AI 面试。",
    score: "86",
  },
  {
    fit: "较匹配",
    name: "周远",
    note: "工程能力扎实，但大型团队协作范围需要进一步确认。",
    score: "79",
  },
  {
    fit: "待确认",
    name: "陈一凡",
    note: "业务经历贴近岗位，核心技术深度在简历中证据不足。",
    score: "72",
  },
] as const;

function CandidateComparison() {
  return (
    <div className="mt-4 grid gap-2">
      {CANDIDATES.map((candidate) => (
        <div className="rounded-2xl border bg-muted/40 px-4 py-3" key={candidate.name}>
          <div className="flex items-center gap-2">
            <span className="font-medium">{candidate.name}</span>
            <Badge variant={candidate.score === "86" ? "success" : "outline"}>
              {candidate.score} 分 · {candidate.fit}
            </Badge>
          </div>
          <p className="mt-1.5 text-muted-foreground text-sm leading-6">{candidate.note}</p>
        </div>
      ))}
    </div>
  );
}

function Composer() {
  return (
    <div className="mx-auto w-full max-w-[896px] px-4 pb-5">
      <div className="flex w-full items-end gap-2 rounded-[28px] border border-input bg-background px-3 py-2">
        <span className="min-h-9 min-w-0 flex-1 px-2 py-2 text-muted-foreground text-base">
          询问招聘进度、候选人或岗位，也可以用 @ 提及
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <IconArrowUp className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-center text-muted-foreground text-xs">
        AI Hiring Copilot 可能出错，请在确认动作前核对候选人和岗位信息。可用 @ 提及招聘台 /
        人才库候选人。
      </p>
    </div>
  );
}

function Conversation() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="mx-auto flex w-full max-w-[896px] flex-1 flex-col gap-7 overflow-hidden px-4 pt-10">
        <div className="ml-auto max-w-[70%] rounded-[22px] border border-border bg-muted/55 px-4 py-2.5 text-sm leading-7">
          对比招聘台里资深前端工程师岗位的三位候选人，告诉我谁更适合优先推进。
        </div>

        <div className="w-full text-sm leading-7">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
              <IconSparkles className="size-4" />
            </span>
            招聘协作
          </div>
          <p>
            我按岗位要求、项目证据和当前招聘进度做了对比。李铭的核心能力覆盖最完整，可以优先推进；另外两位分别需要补充团队规模和技术深度证据。
          </p>
          <CandidateComparison />
          <div className="mt-3 flex items-center gap-2 text-muted-foreground text-xs">
            <IconUsers className="size-3.5" /> 已读取 3 位招聘台候选人
            <span aria-hidden="true">·</span>
            <IconBriefcase className="size-3.5" /> 资深前端工程师
          </div>
        </div>
      </div>
      <Composer />
    </div>
  );
}

export function ChatScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell bodyClassName="h-full" breadcrumb={BREADCRUMB} sidebar={<ChatNav />} tab="agent">
        <Conversation />
      </AppShell>
    </ScreenFrame>
  );
}
