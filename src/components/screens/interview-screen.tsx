// 用途：landing 用「语音面试」简化版 UI，对齐真实 WaitingView：
// 大标题「你好，[name]」+ 角色/轮次副标题 + 5 条 RuleItem + 静音开始/开始面试 按钮。
// Purpose: simplified candidate-facing voice interview WaitingView mock.
import {
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  VideoIcon,
  Volume2Icon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScreenFrame } from "./screen-frame";

interface Rule {
  icon: LucideIcon;
  title: string;
  description: string;
}

const RULES: Rule[] = [
  {
    description:
      "建议佩戴耳机并在网络稳定的地方作答。若环境嘈杂，可选择「静音开始」，以文字方式与面试官沟通。",
    icon: Volume2Icon,
    title: "保持安静的环境",
  },
  {
    description: "等面试官提完问题再作答，答完等下一题。请围绕问题展开，结合具体项目与经历说明。",
    icon: MessageSquareTextIcon,
    title: "一次只答一题",
  },
  {
    description: "保持严肃与尊重；连续答非所问或跳过题目会影响评分，必要时面试官会结束面试。",
    icon: UserCheckIcon,
    title: "认真作答",
  },
  {
    description: "面试将通过摄像头全程录制，开始后请保持摄像头开启，期间不能关闭。",
    icon: VideoIcon,
    title: "保持摄像头录制",
  },
  {
    description:
      "尽量不要刷新页面或关闭标签页。如遇网络中断，请在 3 分钟内回到本页面，可继续之前的对话；超过 3 分钟本轮将自动结束。",
    icon: TriangleAlertIcon,
    title: "保持稳定连接",
  },
];

function RuleItem({ rule }: { rule: Rule }) {
  const Icon = rule.icon;
  return (
    <li className="flex gap-4 py-5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[14px]">{rule.title}</div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">{rule.description}</p>
      </div>
    </li>
  );
}

function InterviewCanvas() {
  return (
    <div className="relative h-full w-full bg-background text-foreground">
      {/* 顶部右侧主题按钮占位 / theme toggle placeholder */}
      <div className="absolute top-4 right-4 z-20">
        <span className="grid size-8 place-items-center rounded-md border border-border/60 bg-background/80 text-muted-foreground">
          <svg fill="none" height="14" viewBox="0 0 24 24" width="14">
            <path
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </span>
      </div>

      {/* 背景柔光 — 替代真实的 /textures/interview-prep-* 图，保持氛围一致 */}
      {/* Soft radial halo replacing the prep-page texture asset */}
      <div
        aria-hidden="true"
        className="-translate-x-1/2 pointer-events-none absolute top-[-180px] left-1/2 size-[680px] rounded-full bg-primary/10 blur-3xl"
      />

      <main className="relative flex h-full w-full select-none flex-col items-center justify-center px-8">
        <div className="flex w-full max-w-2xl flex-col">
          <section>
            <h1 className="text-[32px] tracking-tight">你好，李铭</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              资深前端工程师 · 一面 · 共 5 题，预计 20 分钟内完成。
            </p>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 font-medium text-[13px] text-muted-foreground">开始前，请留意</h2>
            <ul className="divide-y divide-border/60 border-border/60 border-y">
              {RULES.map((rule) => (
                <RuleItem key={rule.title} rule={rule} />
              ))}
            </ul>
          </section>

          <div className="mt-10 flex items-center gap-3">
            <span className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border/70 bg-background text-[14px]">
              <MicOffIcon className="size-4" strokeWidth={1.75} />
              静音开始
            </span>
            <span className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-md bg-primary text-[14px] text-primary-foreground">
              <MicIcon className="size-4" strokeWidth={2} />
              开始面试
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export function InterviewScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <InterviewCanvas />
    </ScreenFrame>
  );
}
