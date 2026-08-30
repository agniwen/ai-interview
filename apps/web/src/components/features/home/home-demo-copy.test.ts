import { afterEach, describe, expect, it } from "vitest";
import * as m from "@/paraglide/messages";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { getHomeDemoCopy } from "./home-demo-copy";

afterEach(() => {
  overwriteGetLocale(() => "zh-CN");
});

describe("getHomeDemoCopy", () => {
  it("provides complete Korean copy for the homepage window-frame demos", () => {
    overwriteGetLocale(() => "ko");

    const copy = getHomeDemoCopy();

    expect(copy.feature.send).toBe("Agent에게 보내기");
    expect(copy.principles).toHaveLength(12);
    expect(copy.process.role.title).toBe("시니어 프런트엔드 엔지니어");
    expect(copy.process.decision.finalDecision).toBe("최종 결정");
    expect(m.home_hero_tagline({}, { locale: "ko" })).toBe("누가 더 적합한지, 더 빠르게.");
    expect(m.login_heading({}, { locale: "ko" })).toBe("계정을 선택해 계속하기");
    expect(m.home_frame_pipeline_title({}, { locale: "ko" })).toBe("면접 절차 분포");
  });
});
