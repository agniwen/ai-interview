import { describe, expect, it } from "vitest";
import type { FilterQuery, FilterRule } from "@/components/reui/filters/filters-types";
import type { ToolbarConditionConfig, ToolbarFilterValue } from "../filter-config";
import { buildToolbarFilterQuery, toolbarFilterChanges } from "../filter-query";

const configs: ToolbarConditionConfig[] = [
  { key: "archived", options: [], type: "select", unfilteredValue: "all" },
  { key: "jobs", options: [], type: "multi-select" },
  { key: "skills", match: "all", options: [], type: "multi-select" },
];

function query(...rules: FilterRule<ToolbarFilterValue>[]): FilterQuery<ToolbarFilterValue> {
  return { combinator: "and", id: "root", rules, type: "group" };
}

function rule(
  field: string,
  operator: string,
  value?: ToolbarFilterValue,
): FilterRule<ToolbarFilterValue> {
  return { id: field, operator, path: [field], type: "rule", value };
}

describe("toolbar filter query contract", () => {
  it("distinguishes job membership from requiring every skill", () => {
    const result = buildToolbarFilterQuery(configs, {
      archived: "all",
      jobs: "a,b",
      skills: "React,SQL",
    });
    expect(result.rules).toEqual([
      rule("jobs", "is_any_of", ["a", "b"]),
      rule("skills", "has_all_of", ["React", "SQL"]),
    ]);
  });

  it("removing the default active-only chip explicitly requests all records", () => {
    expect(
      toolbarFilterChanges(query(), configs, { archived: "active", jobs: "", skills: "" }),
    ).toEqual({ archived: "all" });
  });

  it("does not execute incomplete conditions or discard already applied conditions", () => {
    expect(
      toolbarFilterChanges(query(rule("archived", "is", "active"), rule("jobs", "")), configs, {
        archived: "active",
        jobs: "",
        skills: "",
      }),
    ).toEqual({});
    expect(
      toolbarFilterChanges(query(rule("jobs", "is_any_of")), configs, {
        archived: "all",
        jobs: "a",
        skills: "",
      }),
    ).toEqual({});
  });

  it("canonicalizes a set once and excludes UI ids from resource updates", () => {
    expect(
      toolbarFilterChanges(
        query({ ...rule("jobs", "is_any_of", ["b", "a", "b"]), id: "ui-123" }),
        configs,
        { archived: "all", jobs: "", skills: "" },
      ),
    ).toEqual({ jobs: "a,b" });
    expect(
      toolbarFilterChanges(query(rule("jobs", "is_any_of", ["b", "a"])), configs, {
        archived: "all",
        jobs: "a,b",
        skills: "",
      }),
    ).toEqual({});
  });

  it("clears a multi-selection without touching other fields", () => {
    expect(
      toolbarFilterChanges(query(rule("jobs", "is_any_of", [])), configs, {
        archived: "all",
        jobs: "a,b",
        skills: "",
      }),
    ).toEqual({ jobs: "" });
  });

  it("uses the first config when duplicate keys are provided", () => {
    const duplicateConfigs: ToolbarConditionConfig[] = [
      { key: "status", options: [], type: "select", unfilteredValue: "all" },
      { key: "status", options: [], type: "multi-select" },
    ];

    expect(
      toolbarFilterChanges(query(rule("status", "is", "active")), duplicateConfigs, {
        status: "all",
      }),
    ).toEqual({ status: "active" });
  });

  it("refuses OR, nested groups, negation, unknown fields and duplicate conditions", () => {
    const invalid: FilterQuery<ToolbarFilterValue>[] = [
      { ...query(), combinator: "or" },
      { ...query(), rules: [query()] },
      query({ ...rule("jobs", "is_any_of", ["a"]), negated: true }),
      query(rule("workspace", "is", "other")),
      query(rule("jobs", "is_any_of", ["a"]), rule("jobs", "is_any_of", ["b"])),
      query(rule("skills", "is_any_of", ["React"])),
      query(rule("jobs", "is_any_of", "a")),
    ];
    for (const value of invalid) {
      expect(toolbarFilterChanges(value, configs, {})).toBeNull();
    }
  });
});
