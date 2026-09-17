import { describe, expect, it } from "vitest";
import { isOfferExpired, offerExpiryEndOfDay } from "./offer-expiry";

describe("Offer 截止日期", () => {
  it.each(["2026-09-16", "2026-09-16T00:00:00.000Z", "2026-09-15T16:00:00.000Z"])(
    "%s 包含北京时间截止当天，兼容历史存储",
    (value) => {
      expect(offerExpiryEndOfDay(value).toISOString()).toBe("2026-09-16T15:59:59.999Z");
      expect(isOfferExpired(value, new Date("2026-09-16T08:30:00Z"))).toBe(false);
      expect(isOfferExpired(value, new Date("2026-09-16T15:59:59.999Z"))).toBe(false);
      expect(isOfferExpired(value, new Date("2026-09-16T16:00:00Z"))).toBe(true);
    },
  );
  it("不设置截止日时不过期，规范化后的日期重复转换不偏移", () => {
    expect(isOfferExpired(null)).toBe(false);
    const value = offerExpiryEndOfDay("2026-09-16");
    expect(offerExpiryEndOfDay(value)).toEqual(value);
  });
});
