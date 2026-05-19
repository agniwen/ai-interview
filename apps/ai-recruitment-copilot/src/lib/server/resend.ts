import "server-only";
import { Resend } from "resend";

let cached: Resend | null = null;

export function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY 未配置");
  }
  if (!cached) {
    cached = new Resend(key);
  }
  return cached;
}

export function getResendFrom(): string {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error("RESEND_FROM 未配置");
  }
  return from;
}

// 中文：从 RESEND_FROM 抽出邮箱部分；支持 "Display <addr>" 和裸 addr 两种格式。
// English: Extract the email part from RESEND_FROM, supporting both
// "Display <addr>" and bare-address formats.
function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

// 中文：基于公司名拼出邮件的 From 显示名：「{公司名} AI HR <addr>」，
// 没有公司名就退化为「AI HR <addr>」。沿用 RESEND_FROM 的邮箱地址部分。
// English: Build the From header display name from the configured company:
// "{companyName} AI HR <addr>", falling back to "AI HR <addr>" when blank.
// The email-address part is taken from RESEND_FROM.
export function buildSenderFromAddress(companyName?: string): string {
  const base = getResendFrom();
  const address = extractEmailAddress(base);
  const trimmed = companyName?.trim();
  const displayName = trimmed ? `${trimmed} AI HR` : "AI HR";
  return `${displayName} <${address}>`;
}
