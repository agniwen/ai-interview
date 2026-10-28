"use client";

// 工具调用条，移植自 Beautiful UI 的 Tool Chips（https://www.beautifului.dev/#tool-chips）：
// 结构、尺寸、图标与动效沿用原组件，颜色换成本项目的设计变量；去掉演示用的逐行计时与文件 diff
// 区，数据改为由 assistant-ui 的工具调用 part 转换而来，并补充运行中与告警状态。
// Ported from Beautiful UI's Tool Chips. Layout, sizing, icons and motion follow the original;
// colours use this project's tokens. The demo step timer and file-diff chips are dropped, steps
// come from assistant-ui tool-call parts, and running/warning states are added.

import { useAuiState } from "@assistant-ui/react";
import type { PartState } from "@assistant-ui/react";
import { useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { describeToolCall } from "./tool-chip-descriptors";
import type { ToolChipIcon } from "./tool-chip-descriptors";

export interface ToolChipDetailLine {
  text: string;
  tone?: "warning";
}

export interface ToolChipStep {
  chip: string;
  detail: ToolChipDetailLine[];
  icon: ToolChipIcon;
  id: string;
  label: string;
  mono: boolean;
  status: "done" | "running" | "warning";
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
} as const;

const ICONS = {
  action: (
    <g {...strokeProps}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    </g>
  ),
  edit: (
    <g {...strokeProps}>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </g>
  ),
  list: (
    <g {...strokeProps}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </g>
  ),
  read: (
    <g {...strokeProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </g>
  ),
  search: (
    <g {...strokeProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </g>
  ),
  tool: (
    <g {...strokeProps}>
      <path d="M4 17l6-5-6-5M12 19h8" />
    </g>
  ),
} satisfies Record<ToolChipIcon, ReactNode>;

const WARNING_ICON = (
  <g {...strokeProps}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </g>
);

const EASE_OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";

function Chevron({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("transition-transform duration-200", !open && "-rotate-90", className)}
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="12"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-3 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/** 折叠/展开区域：用 grid 行高过渡，和原组件一致。 */
function Expand({ children, open }: PropsWithChildren<{ open: boolean }>) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none",
        EASE_OUT,
      )}
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function ToolChipRow({ step }: { step: ToolChipStep }) {
  const [rowOpen, setRowOpen] = useState(false);
  const expandable = step.status !== "running" && step.detail.length > 0;
  const warning = step.status === "warning";
  const rowContent = (
    <>
      <span
        className={cn(
          "relative flex size-4 shrink-0 items-center justify-center text-muted-foreground/70",
          warning && "text-warning",
        )}
      >
        {step.status === "running" ? (
          <Spinner />
        ) : (
          <svg
            aria-hidden="true"
            className={cn(
              "transition-opacity duration-100",
              expandable && "group-hover/row:opacity-0",
              rowOpen && "opacity-0",
            )}
            height="13"
            viewBox="0 0 24 24"
            width="13"
          >
            {warning ? WARNING_ICON : ICONS[step.icon]}
          </svg>
        )}
        {expandable ? (
          <Chevron
            className={cn(
              "absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100",
              rowOpen ? "opacity-100" : "opacity-0",
            )}
            open={rowOpen}
          />
        ) : null}
      </span>
      <span className="shrink-0 font-medium text-[12.5px] text-foreground">{step.label}</span>
      {step.chip ? (
        <span
          className={cn(
            "inline-flex h-5 min-w-0 flex-1 items-center rounded-sm bg-control px-1.5 text-[11.5px] text-muted-foreground ring-1 ring-border-subtle transition-colors duration-100",
            expandable && "cursor-pointer group-hover/row:bg-muted",
            warning && "text-warning-foreground",
            step.mono && "font-mono",
          )}
        >
          <span className="truncate">{step.chip}</span>
        </span>
      ) : null}
    </>
  );
  // 固定行高，不继承助手正文的行高；标题行与工具行同高、同样的 hover 内边距。
  const rowClass =
    "group/row -mx-1 flex h-6 w-[calc(100%+8px)] min-w-0 items-center gap-2 rounded-md px-1 text-start leading-none";

  return (
    <div
      className={cn(
        "fade-in slide-in-from-bottom-1 animate-in fill-mode-both duration-300 motion-reduce:animate-none",
        EASE_OUT,
      )}
    >
      {expandable ? (
        <button
          aria-expanded={rowOpen}
          className={cn(rowClass, "transition-colors duration-100 hover:bg-muted")}
          onClick={() => setRowOpen((current) => !current)}
          type="button"
        >
          {rowContent}
        </button>
      ) : (
        <div className={rowClass}>{rowContent}</div>
      )}
      {expandable ? (
        <Expand open={rowOpen}>
          <div className="mt-0.5 mb-1 ms-2 flex flex-col gap-0.5 border-border-subtle border-s py-0.5 ps-3.5">
            {step.detail.map((line, index) => (
              <span
                // oxlint-disable-next-line react/no-array-index-key -- Detail lines come from an immutable tool result and may repeat.
                key={index}
                className={cn(
                  "truncate text-[11.5px] text-muted-foreground leading-[1.6]",
                  line.tone === "warning" && "text-warning-foreground",
                )}
              >
                {line.text}
              </span>
            ))}
          </div>
        </Expand>
      ) : null}
    </div>
  );
}

/**
 * 一组工具调用：多步时带可折叠的标题行，单步时只显示该行。
 * A run of tool calls; a collapsible header is shown only for multi-step runs.
 */
export function ToolChips({
  defaultOpen,
  header,
  steps,
}: {
  defaultOpen: boolean;
  header: ReactNode;
  steps: ToolChipStep[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (steps.length <= 1) {
    return (
      <div className="w-full pb-1">
        {steps.map((step) => (
          <ToolChipRow key={step.id} step={step} />
        ))}
      </div>
    );
  }
  return (
    <div className="w-full pb-1">
      <button
        aria-expanded={open}
        className="-mx-1 flex h-6 w-fit items-center gap-1.5 rounded-md px-1 text-[12.5px] text-muted-foreground leading-none transition-colors duration-100 hover:bg-muted"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Chevron open={open} />
        <span className="tabular-nums">{header}</span>
      </button>
      <Expand open={open}>
        {/* -mx-1 + px-1.5 让行的 hover 底色在裁切容器内完整显示，与原组件一致。 */}
        <div className="-mx-1 px-1 pb-0.5">
          <div className="mt-0.5 flex flex-col gap-0.5">
            {steps.map((step) => (
              <ToolChipRow key={step.id} step={step} />
            ))}
          </div>
        </div>
      </Expand>
    </div>
  );
}

// ---- assistant-ui 适配 ----

type ToolPartState = Extract<PartState, { type: "tool-call" }>;

function isToolPart(part: PartState): part is ToolPartState {
  return part.type === "tool-call";
}

/** 把 assistant-ui 的工具调用 part 转成 Tool Chips 的一行。 */
export function toToolChipStep(part: ToolPartState): ToolChipStep {
  const description = describeToolCall(part);
  const base = {
    icon: description.icon,
    id: part.toolCallId,
    label: description.label,
    mono: description.icon === "tool",
  };
  if (part.isError) {
    return { ...base, chip: "调用失败", detail: [], status: "warning" };
  }
  const settled = part.result !== undefined && part.status.type !== "running";
  if (!settled) {
    return part.status.type === "incomplete"
      ? { ...base, chip: "已中断", detail: [], status: "warning" }
      : { ...base, chip: description.summary, detail: [], status: "running" };
  }
  const warning = description.tone === "warning";
  return {
    ...base,
    chip: description.summary,
    detail: description.detail.map((text) => (warning ? { text, tone: "warning" } : { text })),
    status: warning ? "warning" : "done",
  };
}

/**
 * MessagePrimitive.Parts 的 ToolGroup：先显示这组工具调用的 Tool Chips，再渲染各工具专门的结果 UI。
 * ToolGroup slot for MessagePrimitive.Parts: chips for the grouped calls, then per-tool UIs.
 */
export function ToolChipsGroup({
  children,
  endIndex,
  startIndex,
}: PropsWithChildren<{ endIndex: number; startIndex: number }>) {
  const parts = useAuiState((state) => state.message.parts);
  const steps = parts
    .slice(startIndex, endIndex + 1)
    .filter(isToolPart)
    .map(toToolChipStep);
  const running = steps.some((step) => step.status === "running");
  return (
    <div className="my-1.5 flex flex-col">
      {/* 正在运行的一组默认展开；历史消息默认折叠为一行。 */}
      <ToolChips
        defaultOpen={running}
        header={running ? `正在调用工具（${steps.length}）` : `${steps.length} 次工具调用`}
        steps={steps}
      />
      {children}
    </div>
  );
}
