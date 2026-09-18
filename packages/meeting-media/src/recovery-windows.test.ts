import { describe, expect, it } from "vitest";
import { recoveryWindows } from "./recovery-windows";
describe("bounded recording recovery", () => {
  it("a 218ms gap does not retranscribe a 119 second meeting", () => {
    expect(recoveryWindows({ endMs: 119_000, startMs: 0 }, [{ endMs: 218, startMs: 0 }])).toEqual([
      { endMs: 1218, startMs: 0 },
    ]);
  });
  it("merges context overlaps, clips to available audio and skips other chunks", () => {
    expect(
      recoveryWindows({ endMs: 15_000, startMs: 5000 }, [
        { endMs: 100, startMs: 0 },
        { endMs: 5200, startMs: 4500 },
        { endMs: 7000, startMs: 6000 },
        { endMs: 18_000, startMs: 14_999 },
      ]),
    ).toEqual([
      { endMs: 8000, startMs: 5000 },
      { endMs: 15_000, startMs: 13_999 },
    ]);
  });
});
