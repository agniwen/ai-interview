import "server-only";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

interface RoundInviteEmailProps {
  candidateName: string;
  /** 中文：系统设置里的公司名称，可为空。/ English: company name from global config, optional. */
  companyName?: string;
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

// 中文：标题前缀。配了公司名就放公司名，没配只显示「AI 面试」。
// English: subject prefix — company name when configured, otherwise just "AI 面试".
function buildSubject(companyName: string | undefined, roundLabel: string): string {
  const prefix = companyName?.trim() ? companyName.trim() : "AI 面试";
  return `${prefix} | ${roundLabel} 邀请`;
}

// 中文：邮件样式 token —— 集中放在这，模板各处复用，避免散落 magic 值。
// 选色偏冷静、克制：墨黑 + 米白 + 浅灰边线，营造质感。
// English: design tokens centralised — calm dark + warm off-white +
// hairline grey, for a restrained, premium feel.
const tokens = {
  bgBody: "#f4f4f1",
  bgCard: "#ffffff",
  bgInfo: "#fafaf7",
  border: "#e6e6e0",
  brand: "#111111",
  brandHover: "#000000",
  textMuted: "#6b7280",
  textPrimary: "#1f2937",
  textSubtle: "#9ca3af",
};

const fontStack =
  "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

const INTERVIEW_TIPS = [
  "请确保所处环境安静、光线良好，戴上耳机更佳。",
  "请准备一支麦克风，确保麦克风权限已开启。",
  "建议使用 Chrome / Edge / Safari 最新版浏览器。",
  "保持网络稳定；中途断网会在 3 分钟内自动续接。",
  "面试由 AI 主持，可放松节奏，按自己习惯回答即可。",
];

function RoundInviteEmail({
  candidateName,
  companyName,
  interviewUrl,
  roundLabel,
  scheduledAt,
}: RoundInviteEmailProps) {
  const company = companyName?.trim();
  const subject = buildSubject(companyName, roundLabel);
  const heroLabel = company ? `${company} · AI 招聘` : "AI 招聘";

  return (
    <Html lang="zh-CN">
      <Head />
      <Preview>{subject}</Preview>
      <Body
        style={{
          backgroundColor: tokens.bgBody,
          color: tokens.textPrimary,
          fontFamily: fontStack,
          margin: 0,
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            backgroundColor: tokens.bgCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: "12px",
            margin: "0 auto",
            maxWidth: "600px",
            overflow: "hidden",
          }}
        >
          {/* 顶部品牌条 / Brand band */}
          <Section
            style={{
              backgroundColor: tokens.brand,
              padding: "20px 32px",
            }}
          >
            <Text
              style={{
                color: "#f4f4f1",
                fontSize: "12px",
                letterSpacing: "0.16em",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              {heroLabel}
            </Text>
          </Section>

          {/* 主体 / Main */}
          <Section style={{ padding: "36px 32px 12px" }}>
            <Heading
              as="h1"
              style={{
                color: tokens.textPrimary,
                fontSize: "24px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
                margin: "0 0 20px",
              }}
            >
              AI 面试邀请
            </Heading>

            <Text
              style={{
                color: tokens.textPrimary,
                fontSize: "15px",
                lineHeight: 1.7,
                margin: "0 0 12px",
              }}
            >
              你好，{candidateName}。
            </Text>

            <Text
              style={{
                color: tokens.textPrimary,
                fontSize: "15px",
                lineHeight: 1.7,
                margin: "0 0 20px",
              }}
            >
              {company ? `${company} 邀请你参加 ` : "邀请你参加 "}
              <strong>「{roundLabel}」</strong>
              AI 轮面试。本轮由 AI 面试官全程主持，无需双方协调时间——你在准备好后随时进入即可。
            </Text>

            {/* 信息卡片 / Info card */}
            <Section
              style={{
                backgroundColor: tokens.bgInfo,
                border: `1px solid ${tokens.border}`,
                borderRadius: "8px",
                margin: "8px 0 28px",
                padding: "16px 20px",
              }}
            >
              <Row>
                <Column style={{ paddingBottom: "8px", width: "84px" }}>
                  <Text
                    style={{
                      color: tokens.textSubtle,
                      fontSize: "12px",
                      letterSpacing: "0.04em",
                      margin: 0,
                    }}
                  >
                    面试轮次
                  </Text>
                </Column>
                <Column style={{ paddingBottom: "8px" }}>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontSize: "14px",
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    {roundLabel}
                  </Text>
                </Column>
              </Row>
              {scheduledAt ? (
                <Row>
                  <Column style={{ width: "84px" }}>
                    <Text
                      style={{
                        color: tokens.textSubtle,
                        fontSize: "12px",
                        letterSpacing: "0.04em",
                        margin: 0,
                      }}
                    >
                      预计时间
                    </Text>
                  </Column>
                  <Column>
                    <Text
                      style={{
                        color: tokens.textPrimary,
                        fontSize: "14px",
                        fontWeight: 500,
                        margin: 0,
                      }}
                    >
                      {formatScheduledAt(scheduledAt)}
                    </Text>
                  </Column>
                </Row>
              ) : (
                <Row>
                  <Column style={{ width: "84px" }}>
                    <Text
                      style={{
                        color: tokens.textSubtle,
                        fontSize: "12px",
                        letterSpacing: "0.04em",
                        margin: 0,
                      }}
                    >
                      开始方式
                    </Text>
                  </Column>
                  <Column>
                    <Text
                      style={{
                        color: tokens.textPrimary,
                        fontSize: "14px",
                        fontWeight: 500,
                        margin: 0,
                      }}
                    >
                      准备好后随时点击下方按钮开始
                    </Text>
                  </Column>
                </Row>
              )}
            </Section>

            {/* CTA */}
            <Section style={{ margin: "0 0 28px", textAlign: "center" }}>
              <Button
                href={interviewUrl}
                style={{
                  backgroundColor: tokens.brand,
                  borderRadius: "8px",
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: "15px",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  padding: "12px 28px",
                  textDecoration: "none",
                }}
              >
                进入 AI 面试
              </Button>
            </Section>

            <Text
              style={{
                color: tokens.textSubtle,
                fontSize: "12px",
                lineHeight: 1.6,
                margin: "0 0 4px",
                textAlign: "center",
              }}
            >
              按钮无法点击？请将以下链接复制到浏览器打开：
            </Text>
            <Text
              style={{
                color: tokens.textMuted,
                fontSize: "12px",
                lineHeight: 1.6,
                margin: 0,
                textAlign: "center",
                wordBreak: "break-all",
              }}
            >
              {interviewUrl}
            </Text>
          </Section>

          <Hr style={{ borderColor: tokens.border, borderStyle: "solid", margin: "24px 32px" }} />

          {/* 注意事项 / Interview tips */}
          <Section style={{ padding: "0 32px 32px" }}>
            <Text
              style={{
                color: tokens.textSubtle,
                fontSize: "12px",
                fontWeight: 500,
                letterSpacing: "0.16em",
                margin: "0 0 12px",
                textTransform: "uppercase",
              }}
            >
              面试前请准备
            </Text>
            {INTERVIEW_TIPS.map((tip) => (
              <Text
                key={tip}
                style={{
                  color: tokens.textPrimary,
                  fontSize: "13px",
                  lineHeight: 1.7,
                  margin: "0 0 6px",
                  paddingLeft: "14px",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    color: tokens.textSubtle,
                    fontSize: "12px",
                    left: 0,
                    position: "absolute",
                    top: "1px",
                  }}
                >
                  •
                </span>
                {tip}
              </Text>
            ))}
          </Section>

          {/* 签名 / Sign-off */}
          <Section
            style={{
              backgroundColor: tokens.bgInfo,
              borderTop: `1px solid ${tokens.border}`,
              padding: "16px 32px",
            }}
          >
            <Text
              style={{
                color: tokens.textMuted,
                fontSize: "12px",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              此邮件由 {company ? `${company} AI HR` : "AI HR"} 自动发送，请勿直接回复。
              如有疑问，请联系招聘联系人。
            </Text>
          </Section>
        </Container>

        <Text
          style={{
            color: tokens.textSubtle,
            fontSize: "11px",
            margin: "16px auto 0",
            maxWidth: "600px",
            textAlign: "center",
          }}
        >
          {company ?? "AI 招聘"} · Powered by AI Recruitment
        </Text>
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
    subject: buildSubject(props.companyName, props.roundLabel),
    text,
  };
}
