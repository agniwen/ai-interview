"use client";
import { Button } from "@mastra/playground-ui/components/Button";
import { Column } from "@mastra/playground-ui/components/Columns";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { PrevNextNav } from "@mastra/playground-ui/components/PrevNextNav";
import { getShortId } from "@mastra/playground-ui/components/Text";
import { useSpanDetail } from "@mastra/playground-ui/domains/traces/hooks/use-span-detail";
import { BracesIcon, XIcon } from "lucide-react";
import { ExperimentTraceSpanDetails } from "./experiment-trace-span-details";

export interface ExperimentResultSpanPaneProps {
  traceId: string;
  spanId: string;
  onNext?: () => void;
  onPrevious?: () => void;
  onClose: () => void;
}

export function ExperimentResultSpanPane({
  traceId,
  spanId,
  onNext,
  onPrevious,
  onClose,
}: ExperimentResultSpanPaneProps) {
  const { data: spanDetail } = useSpanDetail(traceId, spanId);
  const span = spanDetail?.span;

  return (
    <>
      <Column.Toolbar>
        <PrevNextNav
          onPrevious={onPrevious}
          onNext={onNext}
          previousAriaLabel="查看上一个 Span 详情"
          nextAriaLabel="查看下一个 Span 详情"
        />
        <Button onClick={onClose} aria-label="关闭 Span 详情">
          <XIcon />
        </Button>
      </Column.Toolbar>

      <Column.Content>
        <MainHeader withMargins={false}>
          <MainHeader.Column>
            <MainHeader.Title size="smaller">
              <BracesIcon /> Span {getShortId(spanId)}
            </MainHeader.Title>
          </MainHeader.Column>
        </MainHeader>

        <ExperimentTraceSpanDetails span={span} />
      </Column.Content>
    </>
  );
}
