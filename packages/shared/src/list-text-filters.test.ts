import { describe, expect, it } from "vitest";
import {
  listTextFiltersSchema,
  matchesListTextFilters,
  parseListTextFilters,
  serializeListTextFilters,
} from "./list-text-filters";

describe("atomic list text filter contract", () => {
  it("validates only the fields supported by the resource", () => {
    expect(
      listTextFiltersSchema("resumes").safeParse('{"company":"极光","school":"清华"}').success,
    ).toBe(true);
    expect(listTextFiltersSchema("rooms").safeParse('{"company":"极光"}').success).toBe(false);
  });

  it.each(["not-json", "[]", "null", '{"name":42}', JSON.stringify({ name: "x".repeat(201) })])(
    "rejects malformed or oversized filters: %s",
    (value) => {
      expect(listTextFiltersSchema("users").safeParse(value).success).toBe(false);
    },
  );

  it("serializes non-empty values in canonical field order", () => {
    const serialized = serializeListTextFilters({ company: "极光", email: "  ", school: "清华" });
    expect(serialized).toBe('{"company":"极光","school":"清华"}');
    expect(parseListTextFilters(serialized)).toEqual({ company: "极光", school: "清华" });
    expect(serializeListTextFilters({ company: " " })).toBe("");
  });

  it("matches literal substrings using AND without crossing field boundaries", () => {
    const filters = { name: " ROOM_", sid: "50%" };
    expect(matchesListTextFilters(filters, { name: "room_main", sid: "50%-1" })).toBe(true);
    expect(matchesListTextFilters(filters, { name: "room-main", sid: "50%-1" })).toBe(false);
    expect(matchesListTextFilters(filters, { name: "50%-1", sid: "room_main" })).toBe(false);
    expect(matchesListTextFilters(filters, { name: "room_main", sid: null })).toBe(false);
  });
});
