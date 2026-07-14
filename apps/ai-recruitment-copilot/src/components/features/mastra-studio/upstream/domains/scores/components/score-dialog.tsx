import type { ScoreRowData } from "@mastra/core/evals";
import { Button } from "@mastra/playground-ui/components/Button";
import { KeyValueList } from "@mastra/playground-ui/components/KeyValueList";
import { Sections } from "@mastra/playground-ui/components/Sections";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import type { SideDialogRootProps } from "@mastra/playground-ui/components/SideDialog";
import { TextAndIcon, getShortId } from "@mastra/playground-ui/components/Text";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { format } from "date-fns/format";
import {
  HashIcon,
  GaugeIcon,
  FileInputIcon,
  FileOutputIcon,
  ReceiptText,
  EyeIcon,
  ChevronsLeftRightEllipsisIcon,
  CalculatorIcon,
  SaveIcon,
} from "lucide-react";
import { useState } from "react";
import { ScoreAsItemDialog } from "./score-as-item-dialog";

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
  // Heuristic fallback for old data without hasJudge
  return (
    !score.preprocessPrompt &&
    !score.analyzePrompt &&
    !score.generateScorePrompt &&
    !score.generateReasonPrompt
  );
}

interface ScoreDialogProps {
  score?: ScoreRowData;
  scorerName?: string;
  isOpen: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  computeTraceLink: (traceId: string, spanId?: string) => string;
  dialogLevel?: SideDialogRootProps["level"];
  usageContext?: "scorerPage" | "SpanDialog";
}

interface ScoreDialogTopProps {
  onNext?: () => void;
  onPrevious?: () => void;
  onSave: () => void;
  score?: ScoreRowData;
  scorerName?: string;
  usageContext: NonNullable<ScoreDialogProps["usageContext"]>;
}

function ScoreDialogTop({
  onNext,
  onPrevious,
  onSave,
  score,
  scorerName,
  usageContext,
}: ScoreDialogTopProps) {
  return (
    <SideDialog.Top>
      {usageContext === "scorerPage" && (
        <TextAndIcon>
          <GaugeIcon /> {scorerName}
        </TextAndIcon>
      )}
      {usageContext === "SpanDialog" && (
        <>
          <TextAndIcon>
            <EyeIcon /> {getShortId(score?.traceId)}
          </TextAndIcon>
          {score?.spanId && (
            <>
              ›
              <TextAndIcon>
                <ChevronsLeftRightEllipsisIcon />
                {getShortId(score.spanId)}
              </TextAndIcon>
            </>
          )}
        </>
      )}
      ›
      <TextAndIcon>
        <CalculatorIcon />
        {getShortId(score?.id)}
      </TextAndIcon>
      |
      <SideDialog.Nav onNext={onNext} onPrevious={onPrevious} />
      <Button size="lg" className="ml-auto mr-8" disabled={!score} onClick={onSave}>
        <Icon>
          <SaveIcon />
        </Icon>
        Save as Dataset Item
      </Button>
    </SideDialog.Top>
  );
}

function getPromptValue(value: string | undefined, isCodeBased: boolean): string {
  if (value) {
    return value;
  }
  return isCodeBased ? "N/A — code-based scorer does not use prompts" : "N/A — step not configured";
}

interface ScoreSectionsProps {
  isCodeBased: boolean;
  score?: ScoreRowData;
}

function ScoreSections({ isCodeBased, score }: ScoreSectionsProps) {
  const reasonFallback = isCodeBased
    ? "N/A — code-based scorer does not generate a reason"
    : "N/A — step not configured";

  return (
    <>
      <SideDialog.CodeSection
        title={`Score: ${Number.isNaN(score?.score) ? "n/a" : score?.score}`}
        icon={<GaugeIcon />}
        codeStr={score?.reason || reasonFallback}
        simplified={true}
      />
      <SideDialog.CodeSection
        title="Input"
        icon={<FileInputIcon />}
        codeStr={JSON.stringify(score?.input || null, null, 2)}
      />
      <SideDialog.CodeSection
        title="Output"
        icon={<FileOutputIcon />}
        codeStr={JSON.stringify(score?.output || null, null, 2)}
      />
      <SideDialog.CodeSection
        title="Preprocess Prompt"
        icon={<ReceiptText />}
        codeStr={getPromptValue(score?.preprocessPrompt, isCodeBased)}
        simplified={true}
      />
      <SideDialog.CodeSection
        title="Analyze Prompt"
        icon={<ReceiptText />}
        codeStr={getPromptValue(score?.analyzePrompt, isCodeBased)}
        simplified={true}
      />
      <SideDialog.CodeSection
        title="Generate Score Prompt"
        icon={<ReceiptText />}
        codeStr={getPromptValue(score?.generateScorePrompt, isCodeBased)}
        simplified={true}
      />
      <SideDialog.CodeSection
        title="Generate Reason Prompt"
        icon={<ReceiptText />}
        codeStr={getPromptValue(score?.generateReasonPrompt, isCodeBased)}
        simplified={true}
      />
    </>
  );
}

interface ScoreMetadataProps {
  computeTraceLink: ScoreDialogProps["computeTraceLink"];
  score?: ScoreRowData;
  usageContext: NonNullable<ScoreDialogProps["usageContext"]>;
}

function formatCreatedAt(score?: ScoreRowData): string {
  return score?.createdAt ? format(new Date(score.createdAt), "MMM d, h:mm:ss aaa") : "n/a";
}

function ScoreMetadata({ computeTraceLink, score, usageContext }: ScoreMetadataProps) {
  const { Link, paths } = useLinkComponent();
  const scorerDetailHref =
    score?.scorerId && score.entityId
      ? `${paths.scorerLink(score.scorerId)}?entity=${encodeURIComponent(score.entityId)}&scoreId=${encodeURIComponent(score.id)}`
      : undefined;

  if (usageContext === "SpanDialog") {
    return (
      <KeyValueList
        data={[
          {
            key: "scorer-name",
            label: "Scorer",
            value: scorerDetailHref ? (
              <Link href={scorerDetailHref}>{(score?.scorer?.name as string) || "-"}</Link>
            ) : (
              (score?.scorer?.name as string) || "-"
            ),
          },
          {
            key: "date",
            label: "Created at",
            value: formatCreatedAt(score),
          },
        ]}
      />
    );
  }

  return (
    <KeyValueList
      data={[
        {
          key: "date",
          label: "Created at",
          value: formatCreatedAt(score),
        },
        {
          key: "traceId",
          label: "Trace ID",
          value: score?.traceId ? (
            <Link href={computeTraceLink(score.traceId)}>{score.traceId}</Link>
          ) : (
            "n/a"
          ),
        },
        {
          key: "spanId",
          label: "Span ID",
          value:
            score?.traceId && score.spanId ? (
              <Link href={computeTraceLink(score.traceId, score.spanId)}>{score.spanId}</Link>
            ) : (
              "n/a"
            ),
        },
      ]}
    />
  );
}

export function ScoreDialog({
  score,
  scorerName,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  computeTraceLink,
  dialogLevel = 1,
  usageContext = "scorerPage",
}: ScoreDialogProps) {
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const isCodeBased = isCodeBasedScorer(score);

  return (
    <>
      <SideDialog
        dialogTitle="Scorer Score"
        dialogDescription="View and analyze score details"
        isOpen={isOpen}
        onClose={onClose}
        level={dialogLevel}
      >
        <ScoreDialogTop
          onNext={onNext}
          onPrevious={onPrevious}
          onSave={() => setDatasetDialogOpen(true)}
          score={score}
          scorerName={scorerName}
          usageContext={usageContext}
        />

        <SideDialog.Content>
          <SideDialog.Header>
            <SideDialog.Heading>
              <CalculatorIcon /> Score
            </SideDialog.Heading>
            <TextAndIcon>
              <HashIcon /> {score?.id}
            </TextAndIcon>
          </SideDialog.Header>

          <Sections>
            <ScoreMetadata
              computeTraceLink={computeTraceLink}
              score={score}
              usageContext={usageContext}
            />
            <ScoreSections isCodeBased={isCodeBased} score={score} />
          </Sections>
        </SideDialog.Content>
      </SideDialog>

      <ScoreAsItemDialog
        score={score}
        isOpen={datasetDialogOpen && isOpen}
        onClose={() => setDatasetDialogOpen(false)}
        level={(dialogLevel + 1) as SideDialogRootProps["level"]}
      />
    </>
  );
}
