import { describe, expect, it } from "vitest";
import { backgroundCheckFormInputSchema } from "@app/db-schema/background-check";
import {
  composeBackgroundCheckEmailPreview,
  hasValidBackgroundCheckLink,
} from "./background-check";

describe("background check email", () => {
  const formUrl = "https://example.com/background-check/current-token";

  it("uses the company and candidate in an editable email containing one system link", () => {
    const preview = composeBackgroundCheckEmailPreview({
      candidateEmail: "candidate@example.com",
      candidateName: "任杨帆",
      companyName: "light公司",
      formUrl,
      organizationName: "light测试区",
    });

    expect(preview.subject).toBe("【light公司】背景调查信息采集｜任杨帆");
    expect(preview.to).toBe("candidate@example.com");
    expect(preview.content.split(formUrl)).toHaveLength(2);
    expect(hasValidBackgroundCheckLink(preview.content, formUrl)).toBe(true);
  });

  it.each([
    ["missing", "正文没有链接"],
    ["modified", "https://example.com/background-check/changed-token"],
    ["duplicate", `${formUrl}\n${formUrl}`],
  ])("rejects a %s form link", (_name, content) => {
    expect(hasValidBackgroundCheckLink(content, formUrl)).toBe(false);
  });
});

describe("background check form", () => {
  const valid = {
    candidateName: "任杨帆",
    consent: true,
    employmentRecords: [
      {
        colleague: { contact: "colleague@example.com", name: "同事" },
        companyName: "示例公司",
        contactPermission: true,
        disciplinaryRecord: "无",
        employmentEnd: "2026-08-01",
        employmentStart: "2024-01-01",
        hasLeftCompany: true,
        hrContact: { contact: "hr@example.com", name: "人力" },
        lastPosition: "前端工程师",
        leavingReason: "employee_resigned",
        leavingReasonOther: null,
        lineManager: { contact: "manager@example.com", name: "主管" },
      },
    ],
    gender: "male",
    graduationCertificateNumber: "GRAD-1",
    idNumber: "440300199001011234",
    signatureName: "任杨帆",
    signedDate: "2026-09-11",
  };

  it("accepts one complete employment record", () => {
    expect(backgroundCheckFormInputSchema.safeParse(valid).success).toBe(true);
  });

  it("requires consent and chronological employment dates", () => {
    expect(backgroundCheckFormInputSchema.safeParse({ ...valid, consent: false }).success).toBe(
      false,
    );
    expect(
      backgroundCheckFormInputSchema.safeParse({
        ...valid,
        employmentRecords: [{ ...valid.employmentRecords[0], employmentEnd: "2023-01-01" }],
      }).success,
    ).toBe(false);
  });

  it("allows a current employer without an employment end date", () => {
    expect(
      backgroundCheckFormInputSchema.safeParse({
        ...valid,
        employmentRecords: [
          {
            ...valid.employmentRecords[0],
            employmentEnd: null,
            hasLeftCompany: false,
            leavingReason: null,
            leavingReasonOther: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires the original collection table's references, declaration signature and date", () => {
    expect(
      backgroundCheckFormInputSchema.safeParse({
        ...valid,
        employmentRecords: [
          { ...valid.employmentRecords[0], hrContact: { contact: "", name: "" } },
        ],
      }).success,
    ).toBe(false);
    expect(
      backgroundCheckFormInputSchema.safeParse({ ...valid, signatureName: "其他人" }).success,
    ).toBe(false);
    expect(backgroundCheckFormInputSchema.safeParse({ ...valid, signedDate: "" }).success).toBe(
      false,
    );
  });
});
