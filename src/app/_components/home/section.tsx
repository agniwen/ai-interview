// 用途：统一长落地页各分区的纵向节奏与排版
// Purpose: consistent vertical rhythm + typography for landing sections.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
        "mx-auto w-full px-5 py-24 sm:px-8 sm:py-28 lg:py-32",
        width === "wide" ? "max-w-7xl" : "max-w-6xl",
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
    <p className="pixel-title font-medium text-primary text-sm uppercase tracking-[0.18em] sm:text-base">
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
        "mt-3 max-w-3xl font-bold text-3xl text-foreground leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl",
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
        "mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg",
        className,
      )}
    >
      {children}
    </p>
  );
}
