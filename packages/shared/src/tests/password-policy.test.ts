import { describe, expect, it } from "vitest";
import { evaluatePassword, getPasswordPolicyViolation } from "../password-policy";

describe("password policy", () => {
  it("requires 8–128 characters and at least three of four character classes", () => {
    expect(getPasswordPolicyViolation("Ab1!")).toBe("密码至少 8 位");
    expect(getPasswordPolicyViolation(`Aa1!${"x".repeat(125)}`)).toBe("密码不能超过 128 位");
    expect(getPasswordPolicyViolation("abcdefgh1")).toBe(
      "密码需包含大写字母、小写字母、数字、符号中的至少 3 类",
    );
    expect(getPasswordPolicyViolation("abcdefg1!")).toBeNull();
    expect(getPasswordPolicyViolation("ABCDEFG1a")).toBeNull();
  });

  it("treats any visible non-alphanumeric character as a symbol", () => {
    expect(evaluatePassword("密码abc").categories.symbol).toBe(false);
    expect(evaluatePassword("abc。").categories.symbol).toBe(true);
    expect(evaluatePassword("abc def").categories.symbol).toBe(false);
  });

  it("rates strength from the enforced policy", () => {
    expect(evaluatePassword("").strength).toBe("empty");
    expect(evaluatePassword("password").strength).toBe("weak");
    expect(evaluatePassword("Password1").strength).toBe("medium");
    // 满足规则但不足 12 位或未覆盖四类时只算「中」。
    expect(evaluatePassword("Password12345").strength).toBe("medium");
    expect(evaluatePassword("Password-1234").strength).toBe("strong");
  });
});
