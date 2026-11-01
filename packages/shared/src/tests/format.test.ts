// 数字 / 文本格式化工具测试 / Tests for number & text formatting helpers.

import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDisplayValue,
  formatElapsedSeconds,
  formatNumber,
  formatPercent,
  truncate,
} from "@app/shared/utils/format";

describe("formatDisplayValue", () => {
  it("returns default fallback '未发现信息' for null and undefined", () => {
    const absent = undefined;
    expect(formatDisplayValue(null)).toBe("未发现信息");
    expect(formatDisplayValue(absent)).toBe("未发现信息");
  });

  it("uses custom fallback when provided", () => {
    expect(formatDisplayValue(null, "N/A")).toBe("N/A");
  });

  it("treats empty / whitespace-only strings as missing", () => {
    expect(formatDisplayValue("")).toBe("未发现信息");
    expect(formatDisplayValue("   ")).toBe("未发现信息");
    expect(formatDisplayValue("\n\t")).toBe("未发现信息");
  });

  it("trims surrounding whitespace from strings", () => {
    expect(formatDisplayValue("  abc  ")).toBe("abc");
  });

  it("stringifies numbers including 0 and negatives", () => {
    expect(formatDisplayValue(0)).toBe("0");
    expect(formatDisplayValue(-1)).toBe("-1");
    expect(formatDisplayValue(3.14)).toBe("3.14");
  });
});

describe("truncate", () => {
  it("returns the input unchanged when it fits in max", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcde", 5)).toBe("abcde");
  });

  it("appends ellipsis when truncating with default suffix", () => {
    expect(truncate("abcdefgh", 5)).toBe("ab...");
  });

  it("uses custom suffix", () => {
    expect(truncate("abcdefgh", 6, "…")).toBe("abcde…");
  });

  it("falls back to plain slice when max <= suffix length", () => {
    expect(truncate("abcdef", 2)).toBe("ab");
    expect(truncate("abcdef", 3)).toBe("abc");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("formatNumber", () => {
  it("groups thousands in zh-CN", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1_234_567)).toBe("1,234,567");
  });

  it("respects the locale argument", () => {
    expect(formatNumber(1000, "en-US")).toBe("1,000");
  });

  it("formats small numbers without grouping", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(42)).toBe("42");
  });

  it("preserves sign", () => {
    expect(formatNumber(-1000)).toBe("-1,000");
  });
});

describe("formatBytes", () => {
  it("returns '—' for invalid or negative input", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });

  it("uses 'B' below 1024", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("steps up through KB / MB / GB / TB at 1024 multiples", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
    expect(formatBytes(1024 ** 4)).toBe("1.0 TB");
  });

  it("clamps at TB (largest known unit) for huge values", () => {
    expect(formatBytes(1024 ** 5)).toBe("1024.0 TB");
  });

  it("respects custom fractionDigits", () => {
    expect(formatBytes(1536, 2)).toBe("1.50 KB");
    expect(formatBytes(1536, 0)).toBe("2 KB");
  });
});

describe("formatElapsedSeconds", () => {
  it("clamps negative input to 0", () => {
    expect(formatElapsedSeconds(-10)).toBe("00:00");
  });

  it("floors fractional seconds", () => {
    expect(formatElapsedSeconds(59.9)).toBe("00:59");
  });

  it("uses mm:ss for under an hour", () => {
    expect(formatElapsedSeconds(0)).toBe("00:00");
    expect(formatElapsedSeconds(7)).toBe("00:07");
    expect(formatElapsedSeconds(60)).toBe("01:00");
    expect(formatElapsedSeconds(3599)).toBe("59:59");
  });

  it("uses hh:mm:ss once we hit an hour", () => {
    expect(formatElapsedSeconds(3600)).toBe("01:00:00");
    expect(formatElapsedSeconds(3661)).toBe("01:01:01");
    expect(formatElapsedSeconds(36_000)).toBe("10:00:00");
  });

  it("does not zero-pad hours beyond two digits (rolls naturally)", () => {
    // 100h = 360,000s, should still render hours with minimum 2 digits
    expect(formatElapsedSeconds(360_000)).toBe("100:00:00");
  });
});

describe("formatPercent", () => {
  it("returns '—' for NaN / Infinity", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formats 0..1 ratios with 0 fraction digits by default", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("respects custom fractionDigits", () => {
    expect(formatPercent(0.1234, 1)).toBe("12.3%");
    expect(formatPercent(0.1234, 2)).toBe("12.34%");
  });

  it("handles ratios outside 0..1", () => {
    expect(formatPercent(-0.5)).toBe("-50%");
    expect(formatPercent(1.5)).toBe("150%");
  });
});
