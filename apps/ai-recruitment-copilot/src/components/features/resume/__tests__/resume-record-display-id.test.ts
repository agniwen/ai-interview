import { describe, expect, it } from "vitest";
import {
  formatResumeCandidateTitle,
  formatResumeRecordDisplayId,
} from "@/components/features/resume/resume-record-display-id";

describe("resume record display id", () => {
  it("masks the middle of the existing id with four stars", () => {
    expect(formatResumeRecordDisplayId("abcd1234wxyz")).toBe("abcd****wxyz");
    expect(formatResumeCandidateTitle("张三", "abcd1234wxyz")).toBe("张三 (abcd****wxyz)");
  });
});
