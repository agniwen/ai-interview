/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
// 中文：面试报告通知卡片。header 颜色由 recommendation 决定（绿/黄/红/灰）
// English: interview summary notification card; header color reflects recommendation
import type { FeishuHeaderTemplate } from "@repo/adapter-feishu";
import { Card, CardText, Divider, Field, Fields, Section } from "chat";

export interface InterviewSummaryCardProps {
  assessment: string | null;
  candidateName: string;
  detailUrl: string;
  overallScore: string;
  recommendation: string;
  summary: string | null;
  targetRole: string | null;
}

export function InterviewSummaryCard({
  assessment,
  candidateName,
  detailUrl,
  overallScore,
  recommendation,
  summary,
  targetRole,
}: InterviewSummaryCardProps) {
  return (
    <Card title="📋 AI 面试报告已生成">
      <Section>
        <Fields>
          <Field label="候选人" value={candidateName} />
          <Field label="目标岗位" value={targetRole ?? "未填写"} />
          <Field label="综合评分" value={overallScore} />
          <Field label="推荐结论" value={recommendation} />
        </Fields>
      </Section>
      {assessment ? <Divider /> : null}
      {assessment ? (
        <Section>
          <CardText>{`**整体评价**\n${assessment}`}</CardText>
        </Section>
      ) : null}
      {summary ? <Divider /> : null}
      {summary ? (
        <Section>
          <CardText>{`**面试摘要**\n${summary}`}</CardText>
        </Section>
      ) : null}
      <Divider />
      <Section>
        <CardText>{`🔗 [查看完整报告](${detailUrl})`}</CardText>
      </Section>
    </Card>
  );
}

// 中文：录用建议 → header 颜色。文案来自 interview-report.ts 的 recommendation enum
// English: map recommendation to Feishu header color; values from interview-report.ts enum
export function resolveHeaderTemplate(recommendation: string): FeishuHeaderTemplate {
  if (recommendation.includes("不建议")) {
    return "red";
  }
  if (recommendation.includes("待定")) {
    return "yellow";
  }
  if (recommendation.includes("建议")) {
    return "green";
  }
  return "grey";
}
