/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
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
