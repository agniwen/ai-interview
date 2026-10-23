// 用途：统一长落地页各分区的纵向节奏与排版
// Purpose: consistent vertical rhythm + typography for landing sections.
import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

/** 内容板块统一 1440 容器、左右 64px 留白（与首屏 1680 容器区分）。 */
export function Section({ children, className, id }: SectionProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-360 px-6 py-14 sm:px-8 sm:py-16 lg:px-16 lg:py-20",
        className,
      )}
      id={id}
    >
      {children}
    </section>
  );
}

interface SectionTitleProps {
  children: ReactNode;
  className?: string;
}
export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <h2
      className={cn(
        "max-w-[20em] text-balance font-medium text-[clamp(1.75rem,2.4vw,2rem)] text-foreground leading-[1.3] tracking-[-0.02em]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

const CJK_SENTENCE_END = /(?<=[。！？])(?=\S)/u;

/**
 * 落地页说明段：中文按句换行，句内只在标点/空格处折行并均衡行长，避免单字断词与孤字尾行。
 * Lead copy: one CJK sentence per line, wrapping only at punctuation or spaces and balancing
 * line lengths; Latin text keeps normal flow.
 */
export function LeadText({ children, className }: { children: string; className?: string }) {
  const sentences = children.split(CJK_SENTENCE_END);
  return (
    <p
      className={cn(
        "max-w-[28rem] text-muted-foreground text-base leading-[1.8] [overflow-wrap:anywhere] [word-break:keep-all] sm:text-lg lg:text-base xl:text-lg",
        className,
      )}
    >
      {sentences.map((sentence) => (
        <span className="block text-balance" key={sentence}>
          {sentence}
        </span>
      ))}
    </p>
  );
}

export function SectionHeader({
  action,
  align = "start",
  lead,
  title,
}: {
  /** 标题右侧的行动按钮，对齐 ElevenLabs 的「了解更多」。 Optional action beside the title. */
  action?: ReactNode;
  /** 居中用于轮播类板块（对齐 qoder 的产品展示）。 Centered for carousel sections. */
  align?: "center" | "start";
  lead: string;
  title: ReactNode;
}) {
  const centered = align === "center";
  const header = (
    <div className={cn("flex flex-col gap-3", centered && "items-center text-center")}>
      <SectionTitle>{title}</SectionTitle>
      <LeadText className="max-w-[40rem] sm:text-base xl:text-base">{lead}</LeadText>
    </div>
  );
  if (!action) {
    return header;
  }
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      {header}
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/**
 * 分区之间的细分隔线：只占内容宽度，两端淡出，不做框线。
 * Soft divider between sections: content width only, fading at both ends.
 */
export function SectionDivider() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-360 px-6 sm:px-8 lg:px-16">
      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}
