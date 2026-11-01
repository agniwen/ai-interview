import { describe, expect, it } from "vitest";
import { serializeDateRange } from "../mail-ingest-date-range";

describe("serializeDateRange", () => {
  it("from → local day start, to → local day end; from>to throws", () => {
    const r = serializeDateRange("2026-07-01", "2026-07-02");
    expect(r.receivedFrom).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    expect(r.receivedTo).toBe(new Date(2026, 6, 2, 23, 59, 59, 999).toISOString());
    expect(() => serializeDateRange("2026-07-03", "2026-07-01")).toThrow();
  });
});
