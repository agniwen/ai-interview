// 结构化输出抽取与校验测试 / Tests for structured-output JSON extraction & validation.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseJsonOutput } from "@app/server/server/agents/json-output";

const SCHEMA = z.object({
  age: z.number(),
  name: z.string(),
});

const LABEL = "test";

describe("parseJsonOutput", () => {
  // 静音失败路径的 console.error，避免污染测试输出。
  // Mute console.error on the failure paths so the test output stays clean.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses plain inline JSON", () => {
    expect(parseJsonOutput('{"name":"a","age":1}', SCHEMA, LABEL)).toEqual({
      age: 1,
      name: "a",
    });
  });

  it("extracts JSON from a ```json fenced block", () => {
    const text = '```json\n{"name":"b","age":2}\n```';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 2, name: "b" });
  });

  it("extracts JSON from a bare ``` fenced block (no language tag)", () => {
    const text = '```\n{"name":"c","age":3}\n```';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 3, name: "c" });
  });

  it("strips prose surrounding the JSON object", () => {
    const text = 'Here is the result: {"name":"d","age":4}. Hope it helps!';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 4, name: "d" });
  });

  it("trims leading / trailing whitespace before parsing", () => {
    const text = '\n\n   {"name":"e","age":5}   \n';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 5, name: "e" });
  });

  it("falls back to the trimmed full text when the fenced block has no braces", () => {
    // 围栏里只是说明文字（没有 { / }，第一候选被 start===-1 跳过），靠 trimmed 全文兜底。
    // The fence captures prose without braces (first candidate skipped via start===-1),
    // so the full trimmed text is the candidate that yields a parseable slice.
    const text = '```json\nplaceholder text\n```\nresult: {"name":"f","age":6}';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 6, name: "f" });
  });

  it("preserves nested JSON objects", () => {
    const text = '{"name":"g","age":7,"meta":{"k":"v"}}';
    expect(parseJsonOutput(text, SCHEMA.passthrough(), LABEL)).toMatchObject({
      age: 7,
      meta: { k: "v" },
      name: "g",
    });
  });

  it("tries multiple JSON objects instead of merging the first opening and last closing brace", () => {
    const text = '示例：{"name":"x"}，最终结果：{"name":"h","age":8}';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 8, name: "h" });
  });

  it("keeps braces inside JSON string values", () => {
    const text = '{"name":"候选人 {A}","age":9}';
    expect(parseJsonOutput(text, SCHEMA, LABEL)).toEqual({ age: 9, name: "候选人 {A}" });
  });

  it("throws when the parsed object fails schema validation", () => {
    const text = '{"name":"x","age":"not-a-number"}';
    expect(() => parseJsonOutput(text, SCHEMA, LABEL)).toThrow(/Failed to parse structured output/);
  });

  it("throws when the input contains no JSON object braces at all", () => {
    expect(() => parseJsonOutput("just some prose", SCHEMA, LABEL)).toThrow(
      /Failed to parse structured output/,
    );
  });

  it("throws when JSON.parse fails on a truncated object", () => {
    const text = '{"name":"x","age":1';
    expect(() => parseJsonOutput(text, SCHEMA, LABEL)).toThrow(/Failed to parse structured output/);
  });

  it("throws on empty input", () => {
    expect(() => parseJsonOutput("", SCHEMA, LABEL)).toThrow(/Failed to parse structured output/);
  });

  it("uses schema-defined empty defaults for empty input", () => {
    const emptyFactsSchema = z
      .object({
        judgments: z.array(z.string()).default([]),
      })
      .strict();

    expect(parseJsonOutput("", emptyFactsSchema, LABEL, { allowEmptyDefaults: true })).toEqual({
      judgments: [],
    });
    expect(() => parseJsonOutput("", emptyFactsSchema, LABEL)).toThrow(
      /Failed to parse structured output/,
    );
  });

  it("logs schema-validation issues with the label prefix", () => {
    const errorSpy = vi.spyOn(console, "error");
    expect(() => parseJsonOutput('{"name":"x"}', SCHEMA, "my-label")).toThrow();
    // 至少出现一次以 [my-label] 开头的失败日志。
    // At least one error call should begin with [my-label].
    const calls = errorSpy.mock.calls.map((args) => String(args[0]));
    expect(calls.some((c) => c.startsWith("[my-label]"))).toBe(true);
  });

  it("does not log raw model output when parsing fails", () => {
    const sensitiveValue = "候选人敏感公司与项目经历";
    const errorSpy = vi.mocked(console.error);

    expect(() =>
      parseJsonOutput(`{"name":"${sensitiveValue}","age":"invalid"}`, SCHEMA, LABEL),
    ).toThrow();

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sensitiveValue);
  });
});
