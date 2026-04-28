// 中文：/jd 系列命令的纯解析单测
// English: pure parser tests for the /jd command family
import { describe, expect, it } from "vitest";
import { parseJdCommand } from "../commands/jd";

describe("parseJdCommand", () => {
  it("returns null for non-command text", () => {
    expect(parseJdCommand("hello")).toBeNull();
    expect(parseJdCommand("")).toBeNull();
    expect(parseJdCommand("/invite")).toBeNull();
  });

  it("parses /jd as 'list'", () => {
    expect(parseJdCommand("/jd")).toEqual({ kind: "list" });
    expect(parseJdCommand("  /jd  ")).toEqual({ kind: "list" });
  });

  it("parses /jd list as 'list'", () => {
    expect(parseJdCommand("/jd list")).toEqual({ kind: "list" });
    expect(parseJdCommand("/jd  list")).toEqual({ kind: "list" });
  });

  it("parses /jd clear as 'clear'", () => {
    expect(parseJdCommand("/jd clear")).toEqual({ kind: "clear" });
  });

  it("returns null for unknown subcommand (kept silent like other unknown DM input)", () => {
    expect(parseJdCommand("/jd nope")).toBeNull();
    expect(parseJdCommand("/jd 123")).toBeNull();
  });
});
