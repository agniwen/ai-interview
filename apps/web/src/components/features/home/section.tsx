// 用途：统一长落地页各分区的纵向节奏与排版
// Purpose: consistent vertical rhythm + typography for landing sections.
import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
  width?: "default" | "wide";
}

export function Section({ children, className, id, width = "default" }: SectionProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full px-6 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-32",
        width === "wide" ? "max-w-360" : "max-w-6xl",
        className,
      )}
      id={id}
    >
      {children}
    </section>
  );
}

interface EyebrowProps {
  children: ReactNode;
}
export function Eyebrow({ children }: EyebrowProps) {
  return (
    <p className="font-mono font-medium text-primary text-sm uppercase tracking-[0.22em] sm:text-base">
      {children}
    </p>
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
        "max-w-[13em] text-balance font-medium text-[clamp(2rem,4.2vw,4rem)] text-foreground leading-[1.18] tracking-[-0.045em]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

interface SectionLeadProps {
  children: ReactNode;
  className?: string;
}
export function SectionLead({ children, className }: SectionLeadProps) {
  return (
    <p
      className={cn(
        "max-w-[25rem] text-pretty text-base text-muted-foreground leading-[1.9] sm:text-lg lg:text-base xl:text-lg",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeader({ title, lead }: { title: ReactNode; lead: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.42fr)] lg:items-end lg:gap-16">
      <SectionTitle>{title}</SectionTitle>
      <SectionLead>{lead}</SectionLead>
    </div>
  );
}
