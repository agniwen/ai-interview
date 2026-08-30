"use client";

import type { InterviewKeyInformation } from "@arc/db-schema/interview-key-information";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { EvidenceList } from "./evaluation-results";
import type { EvidenceQuote } from "./evaluation-results";
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";

interface InformationSectionProps {
  items: InterviewKeyInformation["skillEvidence"];
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
  title: string;
}

function InformationSection({ items, onEvidenceSelect, title }: InformationSectionProps) {
  const { enabledCategories } = useKeywordHighlight();

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium text-sm">{title}</h4>
      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
            key={`${item.content}-${index}`}
          >
            <HighlightedText enabledCategories={enabledCategories} text={item.content} />
            <EvidenceList
              enabledCategories={enabledCategories}
              evidence={item.evidence}
              onEvidenceSelect={onEvidenceSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RiskSection({
  items,
  onEvidenceSelect,
}: {
  items: InterviewKeyInformation["risks"];
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
  const { enabledCategories } = useKeywordHighlight();

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium text-sm">风险与待核实</h4>
      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
            key={`${item.type}-${item.content}-${index}`}
          >
            <div className="flex items-start gap-2">
              <Badge variant={item.type === "observed" ? "danger" : "warning"}>
                {item.type === "observed" ? "明确风险" : "待核实"}
              </Badge>
              <HighlightedText enabledCategories={enabledCategories} text={item.content} />
            </div>
            <EvidenceList
              enabledCategories={enabledCategories}
              evidence={item.evidence}
              onEvidenceSelect={onEvidenceSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KeyInterviewInformation({
  data,
  onEvidenceSelect,
  surface = "card",
}: {
  data: InterviewKeyInformation;
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
  surface?: "card" | "frame";
}) {
  const hasContent =
    data.skillEvidence.length > 0 ||
    data.quantitativeInformation.length > 0 ||
    data.risks.length > 0;

  if (!hasContent) {
    return null;
  }

  const content = (
    <>
      <InformationSection
        items={data.skillEvidence}
        onEvidenceSelect={onEvidenceSelect}
        title="关键技能证据"
      />
      <InformationSection
        items={data.quantitativeInformation}
        onEvidenceSelect={onEvidenceSelect}
        title="关键量化信息"
      />
      <RiskSection items={data.risks} onEvidenceSelect={onEvidenceSelect} />
    </>
  );

  if (surface === "frame") {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>重点信息</FrameTitle>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-4">{content}</FramePanel>
      </Frame>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">重点信息</CardTitle>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">{content}</CardPanel>
    </Card>
  );
}
