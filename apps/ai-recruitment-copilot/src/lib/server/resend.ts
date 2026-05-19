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
