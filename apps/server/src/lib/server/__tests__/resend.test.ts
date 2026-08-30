import { afterEach, describe, expect, it } from "vitest";
import {
  buildSenderFromAddress,
  getResendClient,
  getResendFrom,
} from "@app/server/lib/server/resend";

describe("resend client", () => {
  const ORIGINAL_KEY = process.env.RESEND_API_KEY;
  const ORIGINAL_FROM = process.env.RESEND_FROM;

  afterEach(() => {
    process.env.RESEND_API_KEY = ORIGINAL_KEY;
    process.env.RESEND_FROM = ORIGINAL_FROM;
  });

  it("throws when RESEND_API_KEY is missing", () => {
    process.env.RESEND_API_KEY = "";
    expect(() => getResendClient()).toThrow(/RESEND_API_KEY/);
  });

  it("throws when RESEND_FROM is missing", () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "";
    expect(() => getResendFrom()).toThrow(/RESEND_FROM/);
  });

  it("returns a Resend instance and the from address when env is set", () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "Acme <noreply@example.com>";
    const client = getResendClient();
    expect(client).toBeDefined();
    expect(getResendFrom()).toBe("Acme <noreply@example.com>");
  });
});

describe("buildSenderFromAddress", () => {
  const ORIGINAL_FROM = process.env.RESEND_FROM;

  afterEach(() => {
    process.env.RESEND_FROM = ORIGINAL_FROM;
  });

  it("uses '{company} AI HR' when companyName is provided", () => {
    process.env.RESEND_FROM = "Acme <noreply@example.com>";
    expect(buildSenderFromAddress("字节跳动")).toBe("字节跳动 AI HR <noreply@example.com>");
  });

  it("falls back to 'AI HR' when companyName is blank", () => {
    process.env.RESEND_FROM = "Acme <noreply@example.com>";
    expect(buildSenderFromAddress("")).toBe("AI HR <noreply@example.com>");
    expect(buildSenderFromAddress()).toBe("AI HR <noreply@example.com>");
  });

  it("supports bare-address RESEND_FROM without angle brackets", () => {
    process.env.RESEND_FROM = "noreply@example.com";
    expect(buildSenderFromAddress("Acme")).toBe("Acme AI HR <noreply@example.com>");
  });
});
