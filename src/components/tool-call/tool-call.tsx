"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ToolRenderState } from "@/lib/tool-state";
import {
  ClockIcon,
  FileSearchIcon,
  FileTextIcon,
  ImageIcon,
  ListIcon,
  RulerIcon,
  TargetIcon,
  WrenchIcon,
} from "lucide-react";
import { extractRenderState } from "@/lib/tool-state";
import { ToolLayout } from "./tool-layout";

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export interface ToolCallProps {
  part: ToolPart;
  activeApprovalId?: string | null;
  isStreaming?: boolean;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}

const TOOL_PREFIX_RE = /^tool-/;

function getToolName(part: ToolPart): string {
  if (part.type === "dynamic-tool") {
    return part.toolName;
  }
  return part.type.replace(TOOL_PREFIX_RE, "");
}

interface ToolMeta {
  label: string;
  icon: React.ReactNode;
  getSummary: (input: Record<string, unknown>) => string;
}

const TOOL_META: Record<string, ToolMeta> = {
  analyze_resume_pdf_with_vision: {
    getSummary: (input) => {
      const name = input.resumeName as string | undefined;
      return name ? `视觉分析: ${name}` : "使用视觉模型分析 PDF";
    },
    icon: <ImageIcon className="h-3.5 w-3.5" />,
    label: "视觉分析",
  },
  extract_resume_pdf_structured_info: {
    getSummary: (input) => {
      const name = input.resumeName as string | undefined;
      return name ? `结构化解析: ${name}` : "结构化提取简历信息";
    },
    icon: <FileSearchIcon className="h-3.5 w-3.5" />,
    label: "结构化提取",
  },
  extract_resume_pdf_text: {
    getSummary: (input) => {
      const name = input.resumeName as string | undefined;
      return name ? `提取文本: ${name}` : "从 PDF 提取文本";
    },
    icon: <FileTextIcon className="h-3.5 w-3.5" />,
    label: "提取文本",
  },
  get_resume_review_framework: {
    getSummary: () => "获取简历评审标准",
    icon: <RulerIcon className="h-3.5 w-3.5" />,
    label: "筛选框架",
  },
  get_server_time: {
    getSummary: () => "获取服务端当前时间",
    icon: <ClockIcon className="h-3.5 w-3.5" />,
    label: "获取时间",
  },
  list_uploaded_resume_pdfs: {
    getSummary: () => "列出已上传的 PDF 简历",
    icon: <ListIcon className="h-3.5 w-3.5" />,
    label: "列出简历",
  },
  suggest_job_description: {
    getSummary: (input) => {
      const name = input.resumeName as string | undefined;
      return name ? `匹配在招岗位: ${name}` : "匹配在招岗位";
    },
    icon: <TargetIcon className="h-3.5 w-3.5" />,
    label: "岗位匹配",
  },
};

const DEFAULT_TOOL_META: ToolMeta = {
  getSummary: (input) => {
    const str = JSON.stringify(input);
    return str.length > 50 ? `${str.slice(0, 50)}…` : str;
  },
  icon: <WrenchIcon className="h-3.5 w-3.5" />,
  label: "工具调用",
};

function getOutputSummary(part: ToolPart): string | undefined {
  if (part.state !== "output-available" || !part.output) {
    return undefined;
  }

  const { output } = part;

  if (typeof output === "string") {
    return output.length > 60 ? `${output.slice(0, 60)}…` : output;
  }

  if (Array.isArray(output)) {
    return `${output.length} 条结果`;
  }

  return undefined;
}

function buildExpandedContent(part: ToolPart, state: ToolRenderState) {
  if (state.running || state.denied) {
    return;
  }

  const { output } = part;
  const hasOutput = output !== undefined && output !== null;

  if (!hasOutput && !state.error) {
    return;
  }

  if (state.error) {
    return (
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs leading-relaxed text-red-400">
        {part.errorText ?? state.error}
      </pre>
    );
  }

  const formatted = typeof output === "string" ? output : JSON.stringify(output, null, 2);

  if (!formatted || formatted.length < 10) {
    return;
  }

  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all  border-t border-b border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
      {formatted.length > 2000 ? `${formatted.slice(0, 2000)}…` : formatted}
    </pre>
  );
}

export function ToolCall({
  part,
  activeApprovalId = null,
  isStreaming = false,
  onApprove,
  onDeny,
}: ToolCallProps) {
  const state = extractRenderState(part, activeApprovalId, isStreaming);
  const toolName = getToolName(part);
  const meta = TOOL_META[toolName] ?? DEFAULT_TOOL_META;
  const input = (part.input ?? {}) as Record<string, unknown>;
  const summary = meta.getSummary(input);
  const outputSummary = getOutputSummary(part);
  const statusMeta = part.state === "output-available" ? "完成" : undefined;

  const expandedContent = buildExpandedContent(part, state);

  return (
    <ToolLayout
      name={meta.label}
      icon={meta.icon}
      summary={summary}
      summaryClassName="font-mono"
      meta={statusMeta}
      state={state}
      onApprove={onApprove}
      onDeny={onDeny}
      expandedContent={expandedContent}
      output={
        outputSummary ? <span className="font-mono text-xs">{outputSummary}</span> : undefined
      }
    />
  );
}
