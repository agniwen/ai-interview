/** @jsxImportSource chat */

import {
  Card,
  CardText,
  Divider,
  Field,
  Fields,
  Section,
} from 'chat';

export interface ResumeReportCardProps {
  candidateName?: string | null
  recommendation?: string | null
  level?: string | null
  score?: number | null
  team?: string | null
  strengths?: string[]
  risks?: string[]
  followUps?: string[]
  resumeCount?: number
}

function joinList(items?: string[]): string {
  if (!items || items.length === 0) {
    return '待核实';
  }
  return items.slice(0, 4).map((item, i) => `${i + 1}. ${item}`).join('\n');
}

export function ResumeReportCard(props: ResumeReportCardProps) {
  const {
    candidateName,
    recommendation,
    level,
    score,
    team,
    strengths,
    risks,
    followUps,
    resumeCount,
  } = props;

  const titleParts: string[] = ['📋 简历筛选报告'];
  if (candidateName) {
    titleParts.push(candidateName);
  }
  else if (resumeCount && resumeCount > 1) {
    titleParts.push(`共 ${resumeCount} 份简历`);
  }

  return (
    <Card title={titleParts.join(' · ')}>
      <Section>
        <Fields>
          <Field label='建议' value={recommendation || '待核实'} />
          <Field label='评分' value={score != null ? `${score} / 100` : '待核实'} />
          <Field label='建议定级' value={level || '待核实'} />
          <Field label='团队定位' value={team || '待核实'} />
        </Fields>
      </Section>
      <Divider />
      <Section>
        <CardText>
          {`**✨ 候选人优点**\n${joinList(strengths)}`}
        </CardText>
      </Section>
      <Section>
        <CardText>
          {`**⚠️ 关键风险项**\n${joinList(risks)}`}
        </CardText>
      </Section>
      {followUps && followUps.length > 0
        ? (
            <Section>
              <CardText>
                {`**❓ 建议追问问题**\n${joinList(followUps)}`}
              </CardText>
            </Section>
          )
        : null}
    </Card>
  );
}
