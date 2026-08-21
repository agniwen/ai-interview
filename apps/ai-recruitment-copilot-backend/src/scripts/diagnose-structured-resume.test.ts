import { describe, expect, it } from "vitest";
import { parseDiagnosticOptions } from "./diagnose-structured-resume";

describe("parseDiagnosticOptions", () => {
  it("targets Jin Wenhui by default", () => {
    expect(parseDiagnosticOptions([])).toEqual({ candidateName: "金文辉" });
  });

  it("supports selecting an exact resume", () => {
    expect(parseDiagnosticOptions(["--resume-id", "resume-1"])).toEqual({
      candidateName: "金文辉",
      resumeId: "resume-1",
    });
  });

  it("rejects model and output overrides", () => {
    expect(() => parseDiagnosticOptions(["--model=model-x"])).toThrow("未知参数");
    expect(() => parseDiagnosticOptions(["--output=/tmp/report.json"])).toThrow("未知参数");
  });
});
