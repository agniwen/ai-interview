import "server-only";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

interface RoundInviteEmailProps {
  candidateName: string;
  interviewUrl: string;
  roundLabel: string;
  scheduledAt: Date | null;
}

// 中文：候选人收到邮件时一律按上海时区展示，与产品的中文优先定位一致。
// 如果未来要支持多时区，应改成从面试记录里读取候选人时区。
// English: Render the schedule time in Shanghai time for all recipients —
// matches the product's Chinese-first audience. If multi-timezone support
// is ever needed, pull the candidate's tz from the interview record.
function formatScheduledAt(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function RoundInviteEmail({
  candidateName,
  interviewUrl,
  roundLabel,
  scheduledAt,
}: RoundInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{roundLabel} 面试邀请</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", maxWidth: "560px", padding: "24px" }}>
          <Heading as="h2">面试邀请</Heading>
          <Text>你好 {candidateName}，</Text>
          <Text>诚邀你参加 "{roundLabel}" 环节。</Text>
          {scheduledAt ? <Text>预计时间：{formatScheduledAt(scheduledAt)}</Text> : null}
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={interviewUrl}
              style={{
                backgroundColor: "#111827",
                borderRadius: "6px",
                color: "#ffffff",
                padding: "10px 20px",
                textDecoration: "none",
              }}
            >
              进入面试
            </Button>
          </Section>
          <Text style={{ color: "#6b7280", fontSize: "12px" }}>
            如果按钮无法点击，请复制以下链接到浏览器：{interviewUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderRoundInviteEmail(
  props: RoundInviteEmailProps,
): Promise<{ html: string; subject: string; text: string }> {
  const node = <RoundInviteEmail {...props} />;
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return {
    html,
    subject: `${props.roundLabel} 面试邀请`,
    text,
  };
}
