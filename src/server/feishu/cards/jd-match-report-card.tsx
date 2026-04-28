/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
// 中文：JD 匹配报告卡片；以 JD 名称为主标题，把 score 作为「匹配度」呈现
// English: JD-match report card; uses JD name as title and presents score as match score
import { Card, CardText, Divider, Field, Fields, Section } from "chat";

export interface JdMatchReportCardProps {
  jdTitle: string;
  candidateName?: string | null;
  followUps?: string[];
  level?: string | null;
  recommendation?: string | null;
  risks?: string[];
  score?: number | null;
  strengths?: string[];
  team?: string | null;
}

function joinList(items?: string[]): string {
  if (!items || items.length === 0) {
    return "待核实";
  }
  return items
    .slice(0, 4)
    .map((item, i) => `${i + 1}. ${item}`)
    .join("\n");
}

export function JdMatchReportCard(props: JdMatchReportCardProps) {
  const titleParts: string[] = [`📋 ${props.jdTitle}`];
  if (props.candidateName) {
    titleParts.push(props.candidateName);
  }
  return (
    <Card title={titleParts.join(" · ")}>
      <Section>
        <Fields>
          <Field label="建议" value={props.recommendation || "待核实"} />
          <Field
            label="匹配度"
            value={
              props.score === null || props.score === undefined ? "待核实" : `${props.score} / 100`
            }
          />
          <Field label="建议定级" value={props.level || "待核实"} />
          <Field label="团队定位" value={props.team || "待核实"} />
        </Fields>
      </Section>
      <Divider />
      <Section>
        <CardText>{`**✨ 候选人优点**\n${joinList(props.strengths)}`}</CardText>
      </Section>
      <Section>
        <CardText>{`**⚠️ 关键风险项**\n${joinList(props.risks)}`}</CardText>
      </Section>
      {props.followUps && props.followUps.length > 0 ? (
        <Section>
          <CardText>{`**❓ 建议追问问题**\n${joinList(props.followUps)}`}</CardText>
        </Section>
      ) : null}
    </Card>
  );
}
