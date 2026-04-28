/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
// 中文：飞书未绑定用户的 OAuth 引导卡片
// English: OAuth binding prompt card for unbound Feishu users
import { Actions, Card, CardText, LinkButton, Section } from "chat";

export interface OAuthBindingCardProps {
  appUrl: string;
}

export function OAuthBindingCard(props: OAuthBindingCardProps) {
  const url = `${props.appUrl}/login?return_to=feishu-success`;
  return (
    <Card title="首次使用，请用飞书登录绑定身份">
      <Section>
        <CardText>登录后将自动绑定您的飞书账号，无需重复操作。</CardText>
      </Section>
      <Section>{Actions([LinkButton({ label: "去授权", url })])}</Section>
    </Card>
  );
}
