"use client";

import type { ClientScoreRowData, DatasetExperimentResult } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DataKeysAndValues } from "@mastra/playground-ui/components/DataKeysAndValues";
import { DataList } from "@mastra/playground-ui/components/DataList";
import { DataPanel } from "@mastra/playground-ui/components/DataPanel";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { TraceIcon } from "@mastra/playground-ui/icons/TraceIcon";
import { format } from "date-fns/format";
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ClipboardCheck,
  ExternalLinkIcon,
  FileCodeIcon,
  FileOutputIcon,
  TagIcon,
  TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { ToolMockReportSection } from "./tool-mock-report-section";

export interface ExperimentResultPanelProps {
  result: DatasetExperimentResult;
  scores?: ClientScoreRowData[];
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onShowTrace?: () => void;
  /** When provided, the "Open in Review" button appears for `needs-review` results. */
  onOpenInReview?: () => void;
  onScoreClick?: (scoreId: string) => void;
  featuredScoreId?: string | null;
  onFlagForReview?: (resultId: string) => void;
  /** Controlled collapsed state. When omitted, the panel manages its own state. */
  collapsed?: boolean;
  /** When provided, the collapse button appears in the header and notifies the parent on toggle. */
  onCollapsedChange?: (collapsed: boolean) => void;
}

/** Format unknown value for display. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function getStatusClass(status: string): string {
  if (status === "needs-review") {
    return "bg-orange-500/10 text-orange-400";
  }
  if (status === "complete") {
    return "bg-accent1/10 text-accent1";
  }
  return "bg-neutral3/10 text-neutral4";
}

function getReviewStatusLabel(status: string): string {
  if (status === "needs-review") {
    return "待评审";
  }
  if (status === "complete") {
    return "已完成";
  }
  return status;
}

function getErrorValue(error: unknown): unknown {
  if (error && typeof error === "object") {
    return (error as Record<string, unknown>).message;
  }
  return error;
}

function ResultScores({
  featuredScoreId,
  onScoreClick,
  scores,
}: Pick<ExperimentResultPanelProps, "featuredScoreId" | "onScoreClick" | "scores">) {
  if (!scores || scores.length === 0) {
    return null;
  }
  return (
    <DataList columns="1fr 1fr">
      <DataList.Top>
        <DataList.TopCell>评分器</DataList.TopCell>
        <DataList.TopCell>得分</DataList.TopCell>
      </DataList.Top>
      {scores.map((score) => (
        <DataList.RowButton
          key={score.id}
          featured={featuredScoreId === score.id}
          onClick={() => onScoreClick?.(score.id)}
        >
          <DataList.Cell height="compact">{score.scorerId}</DataList.Cell>
          <DataList.MonoCell>{score.score.toFixed(3)}</DataList.MonoCell>
        </DataList.RowButton>
      ))}
    </DataList>
  );
}

interface ResultReviewSectionProps {
  canFlag: boolean;
  onFlag?: () => void;
  onOpenInReview?: () => void;
  status?: string;
  tags: string[];
}

function ResultReviewSection({
  canFlag,
  onFlag,
  onOpenInReview,
  status,
  tags,
}: ResultReviewSectionProps) {
  if (!status && tags.length === 0 && !canFlag) {
    return null;
  }
  return (
    <div className="grid gap-2">
      <DataPanel.SectionHeading icon={<TagIcon />} className="mb-2">
        评审
      </DataPanel.SectionHeading>
      {(status || tags.length > 0) && (
        <div className="flex flex-wrap gap-2 items-center">
          {status && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusClass(status)}`}
            >
              {getReviewStatusLabel(status)}
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded bg-surface4 text-neutral4">
              {tag}
            </span>
          ))}
        </div>
      )}
      {canFlag && onFlag && (
        <div>
          <Button size="sm" onClick={onFlag}>
            <ClipboardCheck />
            标记为待评审
          </Button>
        </div>
      )}
      {status === "needs-review" && onOpenInReview && (
        <div>
          <Button size="sm" onClick={onOpenInReview}>
            <ExternalLinkIcon />
            评审
          </Button>
        </div>
      )}
    </div>
  );
}

export function ExperimentResultPanel({
  result,
  scores,
  onPrevious,
  onNext,
  onClose,
  onShowTrace,
  onOpenInReview,
  onScoreClick,
  featuredScoreId,
  onFlagForReview,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: ExperimentResultPanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;

  const hasError = Boolean(result?.error);
  const inputStr = formatValue(result?.input);
  const outputStr = formatValue(result?.output);
  const groundTruthStr = formatValue(result?.groundTruth);
  const canFlag = Boolean(
    onFlagForReview && result.status !== "needs-review" && result.status !== "complete",
  );
  const handleFlag = onFlagForReview ? () => onFlagForReview(result.id) : undefined;
  const tags = Array.isArray(result.tags) ? result.tags : [];

  return (
    <DataPanel collapsed={collapsed}>
      <DataPanel.Header>
        <DataPanel.Heading>
          结果 <b># {result.id.length > 12 ? `${result.id.slice(0, 12)}…` : result.id}</b>
        </DataPanel.Heading>
        <ButtonsGroup className="ml-auto shrink-0">
          {onCollapsedChange && (
            <Button
              size="md"
              tooltip={collapsed ? "展开面板" : "收起面板"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
            </Button>
          )}
          <DataPanel.NextPrevNav
            onPrevious={onPrevious}
            onNext={onNext}
            previousLabel="上一个结果"
            nextLabel="下一个结果"
          />
          <Button size="md" onClick={onShowTrace} disabled={!result.traceId}>
            <TraceIcon />
            追踪记录
          </Button>
          <DataPanel.CloseButton onClick={onClose} tooltip="关闭结果面板" />
        </ButtonsGroup>
      </DataPanel.Header>

      {!collapsed && (
        <DataPanel.Content>
          <div className="grid gap-4 mb-6">
            <DataKeysAndValues>
              <DataKeysAndValues.Key>数据项 ID</DataKeysAndValues.Key>
              <DataKeysAndValues.ValueWithCopyBtn
                copyTooltip="复制数据项 ID"
                copyValue={result.itemId}
              >
                {result.itemId}
              </DataKeysAndValues.ValueWithCopyBtn>
              <DataKeysAndValues.Key>创建时间</DataKeysAndValues.Key>
              <DataKeysAndValues.Value>
                {format(new Date(result.createdAt), "yyyy/MM/dd HH:mm")}
              </DataKeysAndValues.Value>
            </DataKeysAndValues>

            {hasError && (
              <Notice variant="destructive" title="错误">
                <Notice.Message>{formatValue(getErrorValue(result.error))}</Notice.Message>
              </Notice>
            )}

            <ResultScores
              featuredScoreId={featuredScoreId}
              onScoreClick={onScoreClick}
              scores={scores}
            />

            {result.toolMockReport && <ToolMockReportSection report={result.toolMockReport} />}

            <ResultReviewSection
              canFlag={canFlag}
              onFlag={handleFlag}
              onOpenInReview={onOpenInReview}
              status={result.status ?? undefined}
              tags={tags}
            />
          </div>

          <div className="grid gap-3">
            <DataPanel.CodeSection title="输入" icon={<FileCodeIcon />} codeStr={inputStr} />
            <DataPanel.CodeSection title="输出" icon={<FileOutputIcon />} codeStr={outputStr} />
            <DataPanel.CodeSection
              title="标准答案"
              icon={<TargetIcon />}
              codeStr={groundTruthStr}
            />
          </div>
        </DataPanel.Content>
      )}
    </DataPanel>
  );
}
