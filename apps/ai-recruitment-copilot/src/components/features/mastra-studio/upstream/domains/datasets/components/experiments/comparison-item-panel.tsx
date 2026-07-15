"use client";

import type { CompareExperimentsResponse } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { Column } from "@mastra/playground-ui/components/Columns";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { PrevNextNav } from "@mastra/playground-ui/components/PrevNextNav";
import { Sections } from "@mastra/playground-ui/components/Sections";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import { FileCodeIcon, FileInputIcon, FileOutputIcon, TargetIcon, XIcon } from "lucide-react";
import { ScoreDelta } from "./score-delta";

type ComparisonItem = CompareExperimentsResponse["items"][number];

export interface ComparisonItemPanelProps {
  item: ComparisonItem;
  baselineId: string;
  contenderId: string;
  baselineVersion?: number | null;
  contenderVersion?: number | null;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function ComparisonItemPanel({
  item,
  baselineId,
  contenderId,
  baselineVersion,
  contenderVersion,
  onPrevious,
  onNext,
  onClose,
}: ComparisonItemPanelProps) {
  const baselineResult = item.results[baselineId];
  const contenderResult = item.results[contenderId];
  const inBoth = Boolean(baselineResult && contenderResult);
  const isComparisonUnavailable = !inBoth;

  const scorerIds = new Set<string>();
  if (baselineResult) {
    for (const key of Object.keys(baselineResult.scores)) {
      scorerIds.add(key);
    }
  }
  if (contenderResult) {
    for (const key of Object.keys(contenderResult.scores)) {
      scorerIds.add(key);
    }
  }
  const sortedScorerIds = [...scorerIds].toSorted();

  return (
    <Column withLeftSeparator={true}>
      <Column.Toolbar>
        <PrevNextNav
          onPrevious={onPrevious}
          onNext={onNext}
          previousAriaLabel="上一个对比数据项"
          nextAriaLabel="下一个对比数据项"
        />
        <ButtonsGroup>
          <Button onClick={onClose} aria-label="关闭对比详情面板">
            <XIcon />
          </Button>
        </ButtonsGroup>
      </Column.Toolbar>

      <Column.Content className="pb-6">
        <MainHeader withMargins={false}>
          <MainHeader.Column>
            <MainHeader.Title size="smaller">
              <FileCodeIcon /> {item.itemId}
            </MainHeader.Title>
          </MainHeader.Column>
        </MainHeader>

        {isComparisonUnavailable ? (
          <Notice variant="warning" title="无法进行对比">
            <Notice.Message>
              {(() => {
                const missingIn = baselineResult ? "对比项" : "基准";
                const version = baselineResult ? contenderVersion : baselineVersion;
                return (
                  <>
                    {missingIn}实验使用了数据集
                    {version === null || version === undefined ? "" : `版本 ${version}`}
                    ，其中不包含此数据项。
                  </>
                );
              })()}
            </Notice.Message>
          </Notice>
        ) : (
          <>
            <Sections>
              {sortedScorerIds.length > 0 && (
                <div className="grid gap-3">
                  <h4 className="text-sm font-medium text-neutral5">得分</h4>
                  <div className="grid gap-2">
                    {sortedScorerIds.map((scorerId) => {
                      const baselineScore = baselineResult?.scores[scorerId] ?? null;
                      const contenderScore = contenderResult?.scores[scorerId] ?? null;
                      const delta =
                        baselineScore !== null &&
                        baselineScore !== undefined &&
                        contenderScore !== null &&
                        contenderScore !== undefined
                          ? contenderScore - baselineScore
                          : null;

                      return (
                        <div
                          key={scorerId}
                          className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-surface2"
                        >
                          <span className="text-sm text-neutral5 font-medium">{scorerId}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-neutral3">
                              {baselineScore === null || baselineScore === undefined
                                ? "-"
                                : baselineScore.toFixed(3)}{" "}
                              →{" "}
                              {contenderScore === null || contenderScore === undefined
                                ? "-"
                                : contenderScore.toFixed(3)}
                            </span>
                            {delta !== null && delta !== undefined && <ScoreDelta delta={delta} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <SideDialog.CodeSection
                title={
                  <>
                    <Chip color="purple">基准 </Chip> 实验输出
                  </>
                }
                icon={<FileOutputIcon />}
                codeStr={formatValue(baselineResult?.output)}
              />
              <SideDialog.CodeSection
                title={
                  <>
                    <Chip color="cyan">对比项 </Chip> 实验输出
                  </>
                }
                icon={<FileOutputIcon />}
                codeStr={formatValue(contenderResult?.output)}
              />
              <SideDialog.CodeSection
                title="数据项输入"
                icon={<FileInputIcon />}
                codeStr={formatValue(item.input)}
              />
              <SideDialog.CodeSection
                title="数据项标准答案"
                icon={<TargetIcon />}
                codeStr={formatValue(item.groundTruth)}
              />
            </Sections>
          </>
        )}
      </Column.Content>
    </Column>
  );
}
