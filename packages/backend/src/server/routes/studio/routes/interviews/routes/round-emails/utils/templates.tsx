import {
  Body,
  Button,
  Column,
  Container,
  Heading,
  Hr,
  Html,
  Img,
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
  heroImageUrl?: string;
  interviewUrl: string;
  roundLabel: string;
  scheduledAt: Date | null;
}

interface InterviewSummaryEmailProps {
  assessment: string | null;
  candidateName: string;
  companyName?: string;
  detailUrl: string;
  heroImageUrl?: string;
  overallScore: string;
  recommendation: string;
  summary: string | null;
  targetRole: string | null;
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
  accent: "#10a8e8",
  bgBody: "#f7fafc",
  bgCard: "#ffffff",
  bgInfo: "#f7fbff",
  border: "#dbe7f3",
  borderSoft: "#e9f0f7",
  textLink: "#2f6fae",
  textMuted: "#4f6b89",
  textPrimary: "#0b1f35",
  textSubtle: "#8aa2bb",
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

const DEFAULT_HERO_ALT = "柔和云海插画";

function EmailHero({ heroImageUrl }: { heroImageUrl?: string }) {
  if (!heroImageUrl) {
    return null;
  }
  return (
    <Img
      alt={DEFAULT_HERO_ALT}
      height="220"
      src={heroImageUrl}
      style={{
        display: "block",
        height: "220px",
        objectFit: "cover",
        width: "100%",
      }}
      width="600"
    />
  );
}

function EmailFooter({ companyName }: { companyName?: string }) {
  const company = companyName?.trim();
  return (
    <>
      <Hr style={{ borderColor: tokens.borderSoft, borderStyle: "solid", margin: "28px 0 20px" }} />
      <Text
        style={{
          color: tokens.textMuted,
          fontSize: "12px",
          lineHeight: 1.65,
          margin: 0,
        }}
      >
        此邮件由 {company ? `${company} AI HR` : "AI HR"}{" "}
        自动发送，请勿直接回复。如有疑问，请联系招聘联系人。
      </Text>
      <Text
        style={{
          color: tokens.textSubtle,
          fontSize: "11px",
          lineHeight: 1.6,
          margin: "16px 0 0",
        }}
      >
        {company ?? "AI 招聘"} · Powered by AI Recruitment
      </Text>
    </>
  );
}

function RoundInviteEmail({
  candidateName,
  companyName,
  heroImageUrl,
  interviewUrl,
  roundLabel,
  scheduledAt,
}: RoundInviteEmailProps) {
  const company = companyName?.trim();
  const subject = buildSubject(companyName, roundLabel);
  const heroLabel = company ? `${company} · AI 招聘` : "AI 招聘";

  return (
    <Html lang="zh-CN">
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
            border: `1px solid ${tokens.borderSoft}`,
            borderRadius: "16px",
            boxShadow: "0 24px 70px rgba(18, 38, 63, 0.08)",
            margin: "0 auto",
            maxWidth: "600px",
            overflow: "hidden",
          }}
        >
          <EmailHero heroImageUrl={heroImageUrl} />

          {/* 主体 / Main */}
          <Section style={{ padding: "42px 44px 36px" }}>
            <Text
              style={{
                color: tokens.textSubtle,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                margin: "0 0 16px",
                textTransform: "uppercase",
              }}
            >
              {heroLabel}
            </Text>
            <Heading
              as="h1"
              style={{
                color: tokens.textPrimary,
                fontSize: "32px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                margin: "0 0 12px",
              }}
            >
              你的 AI 面试已准备好。
            </Heading>

            <Text
              style={{
                color: tokens.textPrimary,
                fontSize: "15px",
                lineHeight: 1.75,
                margin: "0 0 18px",
              }}
            >
              你好，{candidateName}。
            </Text>

            <Text
              style={{
                color: tokens.textPrimary,
                fontSize: "15px",
                lineHeight: 1.75,
                margin: "0 0 28px",
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
                borderRadius: "12px",
                margin: "0 0 30px",
                padding: "18px 20px",
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
                  backgroundColor: tokens.accent,
                  borderRadius: "8px",
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: "15px",
                  fontWeight: 700,
                  padding: "14px 30px",
                  textDecoration: "none",
                }}
              >
                进入 AI 面试 →
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
            <Hr
              style={{
                borderColor: tokens.borderSoft,
                borderStyle: "solid",
                margin: "30px 0 22px",
              }}
            />
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
            <EmailFooter companyName={companyName} />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function buildSummarySubject(companyName: string | undefined, candidateName: string): string {
  const prefix = companyName?.trim() ? companyName.trim() : "AI 面试";
  return `${prefix} | ${candidateName} 的 AI 面试报告已生成`;
}

function InterviewSummaryEmail({
  assessment,
  candidateName,
  companyName,
  detailUrl,
  heroImageUrl,
  overallScore,
  recommendation,
  summary,
  targetRole,
}: InterviewSummaryEmailProps) {
  const subject = buildSummarySubject(companyName, candidateName);

  return (
    <Html lang="zh-CN">
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
            border: `1px solid ${tokens.borderSoft}`,
            borderRadius: "16px",
            boxShadow: "0 24px 70px rgba(18, 38, 63, 0.08)",
            margin: "0 auto",
            maxWidth: "600px",
            overflow: "hidden",
          }}
        >
          <EmailHero heroImageUrl={heroImageUrl} />
          <Section style={{ padding: "42px 44px 36px" }}>
            <Text
              style={{
                color: tokens.textSubtle,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                margin: "0 0 16px",
                textTransform: "uppercase",
              }}
            >
              AI Interview Report
            </Text>
            <Heading
              as="h1"
              style={{
                color: tokens.textPrimary,
                fontSize: "30px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.18,
                margin: "0 0 14px",
              }}
            >
              {candidateName} 的面试报告已生成。
            </Heading>
            <Text
              style={{
                color: tokens.textPrimary,
                fontSize: "15px",
                lineHeight: 1.75,
                margin: "0 0 26px",
              }}
            >
              AI
              面试已完成，系统已整理出评分、推荐结论、整体评价与面试摘要。你可以直接进入工作台查看完整报告。
            </Text>

            <Section
              style={{
                backgroundColor: tokens.bgInfo,
                border: `1px solid ${tokens.border}`,
                borderRadius: "12px",
                margin: "0 0 26px",
                padding: "18px 20px",
              }}
            >
              <Row>
                <Column style={{ paddingBottom: "10px", width: "92px" }}>
                  <Text style={{ color: tokens.textSubtle, fontSize: "12px", margin: 0 }}>
                    候选人
                  </Text>
                </Column>
                <Column style={{ paddingBottom: "10px" }}>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontSize: "14px",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {candidateName}
                  </Text>
                </Column>
              </Row>
              <Row>
                <Column style={{ paddingBottom: "10px", width: "92px" }}>
                  <Text style={{ color: tokens.textSubtle, fontSize: "12px", margin: 0 }}>
                    目标岗位
                  </Text>
                </Column>
                <Column style={{ paddingBottom: "10px" }}>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontSize: "14px",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {targetRole ?? "未填写"}
                  </Text>
                </Column>
              </Row>
              <Row>
                <Column style={{ paddingBottom: "10px", width: "92px" }}>
                  <Text style={{ color: tokens.textSubtle, fontSize: "12px", margin: 0 }}>
                    综合评分
                  </Text>
                </Column>
                <Column style={{ paddingBottom: "10px" }}>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontSize: "14px",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {overallScore}
                  </Text>
                </Column>
              </Row>
              <Row>
                <Column style={{ width: "92px" }}>
                  <Text style={{ color: tokens.textSubtle, fontSize: "12px", margin: 0 }}>
                    推荐结论
                  </Text>
                </Column>
                <Column>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontSize: "14px",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {recommendation}
                  </Text>
                </Column>
              </Row>
            </Section>

            {assessment ? (
              <Text
                style={{
                  color: tokens.textPrimary,
                  fontSize: "14px",
                  lineHeight: 1.75,
                  margin: "0 0 14px",
                }}
              >
                <strong>整体评价：</strong>
                {assessment}
              </Text>
            ) : null}
            {summary ? (
              <Text
                style={{
                  color: tokens.textMuted,
                  fontSize: "14px",
                  lineHeight: 1.75,
                  margin: "0 0 26px",
                }}
              >
                <strong>面试摘要：</strong>
                {summary}
              </Text>
            ) : null}

            <Section style={{ margin: "0 0 18px" }}>
              <Button
                href={detailUrl}
                style={{
                  backgroundColor: tokens.accent,
                  borderRadius: "8px",
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: "15px",
                  fontWeight: 700,
                  padding: "14px 30px",
                  textDecoration: "none",
                }}
              >
                查看完整报告 →
              </Button>
            </Section>

            <Text
              style={{
                color: tokens.textSubtle,
                fontSize: "12px",
                lineHeight: 1.6,
                margin: 0,
                wordBreak: "break-all",
              }}
            >
              按钮无法点击？复制此链接打开：{detailUrl}
            </Text>
            <EmailFooter companyName={companyName} />
          </Section>
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
    subject: buildSubject(props.companyName, props.roundLabel),
    text,
  };
}

export async function renderInterviewSummaryEmail(
  props: InterviewSummaryEmailProps,
): Promise<{ html: string; subject: string; text: string }> {
  const node = <InterviewSummaryEmail {...props} />;
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return {
    html,
    subject: buildSummarySubject(props.companyName, props.candidateName),
    text,
  };
}
