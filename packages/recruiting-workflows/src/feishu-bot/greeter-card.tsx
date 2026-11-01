/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
// 中文：飞书 bot 收到 DM / 群 @ 时回的引导卡片；用 markdown 链接让 URL 以文字形式呈现
// English: greeter card sent on DM / group mention; markdown links render as clickable text
import { Card, CardText, Divider, Section } from "chat";

export interface GreeterCardProps {
  links: { label: string; url: string }[];
}

export function GreeterCard({ links }: GreeterCardProps) {
  const linkLines = links.map((link) => `🔗 [${link.label}](${link.url})`).join("\n");
  return (
    <Card title="👋 AI 面试助手 bot">
      <Section>
        <CardText>
          {`我主要负责：\n• 面试结果通知\n• 候选人简历筛选报告推送\n\n简历筛选、JD 管理、发起面试等操作请前往 Studio Web 端 ↓`}
        </CardText>
      </Section>
      <Divider />
      <Section>
        <CardText>{linkLines}</CardText>
      </Section>
    </Card>
  );
}
