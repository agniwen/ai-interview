import type { ScoreRowData } from "@mastra/core/evals";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DataKeysAndValues } from "@mastra/playground-ui/components/DataKeysAndValues";
import { DataPanel } from "@mastra/playground-ui/components/DataPanel";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { format } from "date-fns/format";
import { FileInputIcon, FileOutputIcon, GaugeIcon, ReceiptText, SaveIcon } from "lucide-react";
import { useState } from "react";
import { ScoreAsItemDialog } from "@/components/features/mastra-studio/upstream/domains/scores/components/score-as-item-dialog";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

function isCodeBasedScorer(score?: ScoreRowData): boolean {
  if (!score) {
    return false;
  }
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

function buildDialogTitle(sectionTitle: string, icon: React.ReactNode, score: ScoreRowData) {
  return (
    <>
      <span className="flex items-center gap-1.5 text-neutral2 uppercase tracking-widest [&>svg]:size-3.5">
        {icon}
        {sectionTitle}
      </span>
      <span>
        › 得分 <b className="text-neutral3">#{score.id}</b>
      </span>
    </>
  );
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function formatScore(score: number | null | undefined) {
  return isDefined(score) && !Number.isNaN(score) ? score : "不适用";
}

export interface ScoreDataPanelProps {
  score: ScoreRowData;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function ScoreDataPanel({ score, onClose, onPrevious, onNext }: ScoreDataPanelProps) {
  const { Link } = useLinkComponent();
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const isCodeBased = isCodeBasedScorer(score);
  const naText = isCodeBased ? "不适用——代码评分器不使用提示词" : "不适用——未配置此步骤";

  return (
    <>
      <DataPanel>
        <DataPanel.Header>
          <DataPanel.Heading>
            得分 <b># {score.id}</b>
          </DataPanel.Heading>
          <ButtonsGroup className="ml-auto shrink-0">
            <DataPanel.NextPrevNav
              onPrevious={onPrevious}
              onNext={onNext}
              previousLabel="上一个得分"
              nextLabel="下一个得分"
            />
            <DataPanel.CloseButton onClick={onClose} />
          </ButtonsGroup>
        </DataPanel.Header>

        <DataPanel.Content>
          <DataKeysAndValues>
            {isDefined(score.scorer?.name) && (
              <>
                <DataKeysAndValues.Key>评分器</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>{String(score.scorer.name)}</DataKeysAndValues.Value>
              </>
            )}
            {score.createdAt && (
              <>
                <DataKeysAndValues.Key>创建时间</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>
                  {format(new Date(score.createdAt), "MM/dd HH:mm:ss.SSS")}
                </DataKeysAndValues.Value>
              </>
            )}
            {score.traceId && (
              <>
                <DataKeysAndValues.Key>追踪 ID</DataKeysAndValues.Key>
                <DataKeysAndValues.ValueLink
                  href={`/traces/${encodeURIComponent(score.traceId)}`}
                  as={Link}
                >
                  {score.traceId}
                </DataKeysAndValues.ValueLink>
              </>
            )}
            {score.spanId && score.traceId && (
              <>
                <DataKeysAndValues.Key>Span ID</DataKeysAndValues.Key>
                <DataKeysAndValues.ValueLink
                  href={`/traces/${encodeURIComponent(score.traceId)}?spanId=${encodeURIComponent(score.spanId)}`}
                  as={Link}
                >
                  {score.spanId}
                </DataKeysAndValues.ValueLink>
              </>
            )}
          </DataKeysAndValues>

          <div className="mt-6 mb-6 flex justify-end ">
            <Button size="sm" onClick={() => setDatasetDialogOpen(true)}>
              <Icon>
                <SaveIcon />
              </Icon>
              保存为数据项
            </Button>
          </div>

          <div className="text-neutral4 mb-6">
            <div
              className={cn(
                "text-neutral2 text-ui-lg flex gap-2 items-baseline",
                "[&>svg]:w-5 [&>svg]:h-5 [&>svg]:translate-y-1",
              )}
            >
              <GaugeIcon />
              <span className="">得分：</span>
              <b className="font-mono text-neutral3">{formatScore(score.score)}</b>
            </div>
            <div className="text-ui-smd font-mono mt-2">
              {score.reason ||
                (isCodeBased ? "不适用——代码评分器不生成理由" : "不适用——未配置此步骤")}
            </div>
          </div>

          <div className="grid gap-4">
            <DataPanel.CodeSection
              title="输入"
              dialogTitle={buildDialogTitle("输入", <FileInputIcon />, score)}
              icon={<FileInputIcon />}
              codeStr={JSON.stringify(score.input ?? null, null, 2)}
            />
            <DataPanel.CodeSection
              title="输出"
              dialogTitle={buildDialogTitle("输出", <FileOutputIcon />, score)}
              icon={<FileOutputIcon />}
              codeStr={JSON.stringify(score.output ?? null, null, 2)}
            />
            <DataPanel.CodeSection
              title="预处理提示词"
              dialogTitle={buildDialogTitle("预处理提示词", <ReceiptText />, score)}
              icon={<ReceiptText />}
              codeStr={score.preprocessPrompt || naText}
              simplified={true}
            />
            <DataPanel.CodeSection
              title="分析提示词"
              dialogTitle={buildDialogTitle("分析提示词", <ReceiptText />, score)}
              icon={<ReceiptText />}
              codeStr={score.analyzePrompt || naText}
              simplified={true}
            />
            <DataPanel.CodeSection
              title="生成得分提示词"
              dialogTitle={buildDialogTitle("生成得分提示词", <ReceiptText />, score)}
              icon={<ReceiptText />}
              codeStr={score.generateScorePrompt || naText}
              simplified={true}
            />
            <DataPanel.CodeSection
              title="生成理由提示词"
              dialogTitle={buildDialogTitle("生成理由提示词", <ReceiptText />, score)}
              icon={<ReceiptText />}
              codeStr={score.generateReasonPrompt || naText}
              simplified={true}
            />
          </div>
        </DataPanel.Content>
      </DataPanel>

      <ScoreAsItemDialog
        score={score}
        isOpen={datasetDialogOpen}
        onClose={() => setDatasetDialogOpen(false)}
      />
    </>
  );
}
