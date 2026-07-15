import type { ToolMockReport } from "@mastra/client-js";
import { DataPanel } from "@mastra/playground-ui/components/DataPanel";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { WrenchIcon } from "lucide-react";

export interface ToolMockReportSectionProps {
  report: ToolMockReport;
}

interface ReportRow {
  outcome: "served" | "live" | "unconsumed";
  toolName: string;
  args: unknown;
}

function formatArgs(args: unknown): string {
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return String(args);
  }
}

function outcomeClass(outcome: ReportRow["outcome"]): string {
  switch (outcome) {
    case "served": {
      return "bg-accent1/10 text-accent1";
    }
    case "live": {
      return "bg-orange-500/10 text-orange-400";
    }
    case "unconsumed": {
      return "bg-neutral3/10 text-neutral4";
    }
    default: {
      return "";
    }
  }
}

function getOutcomeLabel(outcome: ReportRow["outcome"]): string {
  switch (outcome) {
    case "served": {
      return "已使用模拟";
    }
    case "live": {
      return "实时调用";
    }
    case "unconsumed": {
      return "未使用";
    }
    default: {
      return outcome;
    }
  }
}

/**
 * Diagnostics panel for item-level tool mocks on an experiment result.
 *
 * Surfaces what the run did with the item's static mocks:
 * - served: mocks matched and returned to the agent
 * - live: unmocked tools that ran live (non-deterministic)
 * - unconsumed: mocks declared but never used (report-only; does not fail the item)
 * - failure: the mock mis-call that failed the item, if any
 */
export function ToolMockReportSection({ report }: ToolMockReportSectionProps) {
  const { served, unconsumed, liveCalls, failure } = report;

  const rows: ReportRow[] = [
    ...served.map((s) => ({ args: s.args, outcome: "served" as const, toolName: s.toolName })),
    ...liveCalls.map((c) => ({ args: c.args, outcome: "live" as const, toolName: c.toolName })),
    ...unconsumed.map((u) => ({
      args: u.args,
      outcome: "unconsumed" as const,
      toolName: u.toolName,
    })),
  ];

  return (
    <div className="grid gap-2" data-testid="tool-mock-report">
      <DataPanel.SectionHeading icon={<WrenchIcon />} className="mb-2">
        工具模拟
      </DataPanel.SectionHeading>

      {failure && (
        <Notice variant="destructive" title="模拟不匹配">
          <Notice.Message>
            <span className="block">
              {`工具“${failure.toolName}”的调用参数与可用模拟不匹配（${failure.code}）。`}
            </span>
            <span className="mt-1 block font-mono text-xs">
              调用参数： {formatArgs(failure.args)}
            </span>
            {unconsumed.length > 0 && (
              <span className="mt-1 block font-mono text-xs">
                未使用的模拟： {unconsumed.map((u) => formatArgs(u.args)).join(", ")}
              </span>
            )}
          </Notice.Message>
        </Notice>
      )}

      <div className="rounded border border-border1 divide-y divide-border1 text-sm">
        {rows.map((row, i) => (
          <div
            key={`${row.outcome}-${row.toolName}-${i}`}
            className="flex items-center justify-between gap-2 px-3 py-1.5"
          >
            <span className="min-w-0 truncate">
              <span className="font-mono text-neutral4">{row.toolName}</span>
              <span className="ml-2 font-mono text-xs text-neutral3">{formatArgs(row.args)}</span>
            </span>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${outcomeClass(row.outcome)}`}>
              {getOutcomeLabel(row.outcome)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
