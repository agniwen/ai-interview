/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
// 中文：/jd 系列命令的状态反馈卡片
// English: status confirmation cards for /jd command results
import { Card, CardText, Section } from "chat";

export interface ActivatedProps {
  kind: "activated";
  jdLabel: string;
}

export interface ClearedProps {
  kind: "cleared";
}

export type JdStatusCardProps = ActivatedProps | ClearedProps;

export function JdStatusCard(props: JdStatusCardProps) {
  if (props.kind === "activated") {
    return (
      <Card title="✅ 已激活 JD">
        <Section>
          <CardText>{`已激活：**${props.jdLabel}**\n现在投递的简历会按此 JD 匹配。`}</CardText>
        </Section>
      </Card>
    );
  }
  return (
    <Card title="🧹 已清除激活 JD">
      <Section>
        <CardText>后续投递的简历将走通用筛选。</CardText>
      </Section>
    </Card>
  );
}
