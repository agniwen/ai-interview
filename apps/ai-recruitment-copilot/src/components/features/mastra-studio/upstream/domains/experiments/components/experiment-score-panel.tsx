"use client";

import type { ClientScoreRowData } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DataPanel } from "@mastra/playground-ui/components/DataPanel";
import { TraceIcon } from "@mastra/playground-ui/icons/TraceIcon";
import { ChevronsDownUpIcon, ChevronsUpDownIcon, GaugeIcon, ReceiptText } from "lucide-react";
import { useState } from "react";

export interface ExperimentScorePanelProps {
  score: ClientScoreRowData;
  onNext?: () => void;
  onPrevious?: () => void;
  onClose: () => void;
  /** When provided, a Trace button appears in the header; disabled when `score.traceId` is absent. */
  onShowTrace?: () => void;
  /** Controlled collapsed state. When omitted, the panel manages its own state. */
  collapsed?: boolean;
  /** When provided, the collapse button appears in the header and notifies the parent on toggle. */
  onCollapsedChange?: (collapsed: boolean) => void;
}

function isCodeBasedScorer(score: ClientScoreRowData): boolean {
  const scorer = score.scorer as Record<string, unknown> | undefined;
  if (scorer?.hasJudge === false) {
    return true;
  }
  if (scorer?.hasJudge === true) {
    return false;
  }
  return (
    !score.preprocessPrompt &&
    !score.analyzePrompt &&
    !score.generateScorePrompt &&
    !score.generateReasonPrompt
  );
}

export function ExperimentScorePanel({
  score,
  onNext,
  onPrevious,
  onClose,
  onShowTrace,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: ExperimentScorePanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;

  const isCodeBased = isCodeBasedScorer(score);
  const naText = isCodeBased ? "不适用——代码评分器" : "不适用——未配置此步骤";

  return (
    <DataPanel collapsed={collapsed}>
      <DataPanel.Header>
        <DataPanel.Heading>
          得分 <b>{score.scorerId}</b>
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
          {(onPrevious || onNext) && (
            <DataPanel.NextPrevNav
              onPrevious={onPrevious}
              onNext={onNext}
              previousLabel="上一个得分"
              nextLabel="下一个得分"
            />
          )}
          {onShowTrace && (
            <Button size="md" onClick={onShowTrace} disabled={!score.traceId}>
              <TraceIcon />
              追踪记录
            </Button>
          )}
          <DataPanel.CloseButton onClick={onClose} tooltip="关闭得分面板" />
        </ButtonsGroup>
      </DataPanel.Header>

      {!collapsed && (
        <DataPanel.Content>
          <div className="grid gap-3">
            <DataPanel.CodeSection
              title={`得分：${score.score}`}
              icon={<GaugeIcon />}
              codeStr={score.reason || naText}
              simplified
            />

            {!isCodeBased && (
              <>
                <DataPanel.CodeSection
                  title="预处理提示词"
                  icon={<ReceiptText />}
                  codeStr={score.preprocessPrompt || naText}
                  simplified
                />
                <DataPanel.CodeSection
                  title="分析提示词"
                  icon={<ReceiptText />}
                  codeStr={score.analyzePrompt || naText}
                  simplified
                />
                <DataPanel.CodeSection
                  title="生成得分提示词"
                  icon={<ReceiptText />}
                  codeStr={score.generateScorePrompt || naText}
                  simplified
                />
                <DataPanel.CodeSection
                  title="生成理由提示词"
                  icon={<ReceiptText />}
                  codeStr={score.generateReasonPrompt || naText}
                  simplified
                />
              </>
            )}
          </div>
        </DataPanel.Content>
      )}
    </DataPanel>
  );
}
