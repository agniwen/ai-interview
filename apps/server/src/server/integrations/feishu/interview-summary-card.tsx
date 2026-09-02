/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
import { Actions, Card, CardText, Divider, Field, Fields, LinkButton, Section, Table } from "chat";

export interface InterviewSummaryQuestionScore {
  maxScore: number;
  question: string;
  score: number;
}

export interface InterviewSummaryCardProps {
  assessment: string | null;
  candidateName: string;
  detailUrl: string;
  duration: string;
  interviewQuestions: string[];
  interviewStartedAt: string;
  overallScore: string;
  questionScores: InterviewSummaryQuestionScore[];
  recommendation: string;
  resumeEvaluation: string | null;
  summary: string | null;
  targetRole: string | null;
}

export function InterviewSummaryCard({
  assessment,
  candidateName,
  detailUrl,
  duration,
  interviewQuestions,
  interviewStartedAt,
  overallScore,
  questionScores,
  recommendation,
  resumeEvaluation,
  summary,
  targetRole,
}: InterviewSummaryCardProps) {
  const displayedInterviewQuestions = interviewQuestions.slice(0, 3);

  return (
    <Card title="📋 AI 面试报告已生成">
      <Section>
        <Fields>
          <Field label="候选人" value={candidateName} />
          <Field label="目标岗位" value={targetRole ?? "未填写"} />
          <Field label="综合评分" value={overallScore} />
          <Field label="推荐结论" value={recommendation} />
          <Field label="开始时间" value={interviewStartedAt} />
          <Field label="面试耗时" value={duration} />
        </Fields>
      </Section>
      {resumeEvaluation ? <Divider /> : null}
      {resumeEvaluation ? (
        <Section>
          <CardText>{`**简历 AI 评价**\n${resumeEvaluation}`}</CardText>
        </Section>
      ) : null}
      {displayedInterviewQuestions.length > 0 ? <Divider /> : null}
      {displayedInterviewQuestions.length > 0 ? (
        <Section>
          <CardText>{`**候选人面试题（节选 ${displayedInterviewQuestions.length} 道）**\n${displayedInterviewQuestions
            .map((question, index) => `${index + 1}. ${question}`)
            .join("\n")}`}</CardText>
        </Section>
      ) : null}
      {questionScores.length > 0 ? <Divider /> : null}
      {questionScores.length > 0 ? (
        <Section>
          <CardText>**题目得分概览**</CardText>
          <Table
            headers={["题目", "得分"]}
            rows={questionScores.map((item) => [item.question, `${item.score}/${item.maxScore}`])}
          />
        </Section>
      ) : null}
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
      <Actions>
        <LinkButton style="primary" url={detailUrl}>
          查看飞书评价表
        </LinkButton>
      </Actions>
    </Card>
  );
}
