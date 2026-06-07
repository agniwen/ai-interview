// buildAutoJobDescription — 通过 public API 反推内部分支：preset 匹配、hiringType 推断、role 归一化。
// Tests for buildAutoJobDescription — only the public API is exported; internal
// branches (preset lookup, hiring-type inference, role normalization) are
// verified by inspecting the produced string.

import { describe, expect, it } from "vitest";
import { buildAutoJobDescription } from "@arc/backend/server/routes/resume/utils/job-description-presets";

describe("buildAutoJobDescription — output shape", () => {
  it("always contains the four section headers", () => {
    const out = buildAutoJobDescription("前端");
    expect(out).toContain("岗位名称:");
    expect(out).toContain("岗位目标:");
    expect(out).toContain("核心职责:");
    expect(out).toContain("能力要求:");
    expect(out).toContain("加分项:");
  });

  it("renders requirements / responsibilities as bullet-prefixed lines", () => {
    const out = buildAutoJobDescription("前端");
    expect(out).toMatch(/\n- /);
  });

  it("uses the normalized role in the 岗位名称 line", () => {
    const out = buildAutoJobDescription("前端工程师");
    expect(out).toMatch(/岗位名称: 前端工程师/);
  });
});

describe("buildAutoJobDescription — preset keyword matching", () => {
  // 每个 preset 选一段独有的文案作为指纹 / pick a unique fragment per preset as a fingerprint.
  const cases: { role: string; fingerprint: string; label: string }[] = [
    { fingerprint: "会议安排", label: "行政", role: "行政助理" },
    { fingerprint: "HTML/CSS/JavaScript", label: "前端", role: "前端工程师" },
    { fingerprint: "Java、Go、Python", label: "后端", role: "后端工程师" },
    { fingerprint: "Java、Go、Python", label: "服务端", role: "服务端开发" },
    { fingerprint: "Java、Go、Python", label: "后台", role: "后台开发" },
    { fingerprint: "前端框架开发能力和后端服务", label: "全栈", role: "全栈工程师" },
    { fingerprint: "PRD 撰写", label: "产品", role: "产品经理" },
    { fingerprint: "活动策划、内容运营", label: "运营", role: "运营专员" },
    { fingerprint: "指标监控", label: "数据分析", role: "数据分析师" },
    { fingerprint: "算法建模、特征工程", label: "算法", role: "算法工程师" },
    { fingerprint: "测试用例设计", label: "测试", role: "测试工程师" },
    { fingerprint: "Figma、Sketch", label: "设计", role: "UI 设计师" },
    { fingerprint: "招聘流程执行", label: "人事", role: "招聘助理" },
    { fingerprint: "品牌传播、内容营销", label: "市场", role: "市场专员" },
  ];

  for (const { role, fingerprint, label } of cases) {
    it(`role "${role}" hits the ${label} preset`, () => {
      const out = buildAutoJobDescription(role);
      expect(out).toContain(fingerprint);
    });
  }

  it("falls through to the generic default when no preset keyword matches", () => {
    const out = buildAutoJobDescription("某个奇怪岗位 zzz");
    // 默认 preset 的特征文案 / generic default's signature copy
    expect(out).toContain("支持团队完成岗位相关业务目标");
    expect(out).toContain("具备岗位相关的基础知识");
  });
});

describe("buildAutoJobDescription — preset priority (first match wins)", () => {
  it("picks 前端 over 后端 when both keywords appear (前端 comes first in the table)", () => {
    const out = buildAutoJobDescription("前端兼后端");
    expect(out).toContain("HTML/CSS/JavaScript");
    expect(out).not.toContain("Java、Go、Python");
  });
});

describe("buildAutoJobDescription — hiring type inference", () => {
  const INTERNSHIP_FINGERPRINT = "每周可到岗";
  const FULL_TIME_FINGERPRINT = "owner 意识";

  it("treats 实习 / intern / Intern / internship as internship", () => {
    expect(buildAutoJobDescription("前端实习")).toContain(INTERNSHIP_FINGERPRINT);
    expect(buildAutoJobDescription("frontend intern")).toContain(INTERNSHIP_FINGERPRINT);
    expect(buildAutoJobDescription("Frontend Internship")).toContain(INTERNSHIP_FINGERPRINT);
  });

  it("treats 社招 / 全职 / 正式 / full-time variants as full-time", () => {
    expect(buildAutoJobDescription("前端社招")).toContain(FULL_TIME_FINGERPRINT);
    expect(buildAutoJobDescription("全职前端")).toContain(FULL_TIME_FINGERPRINT);
    expect(buildAutoJobDescription("前端 正式")).toContain(FULL_TIME_FINGERPRINT);
    expect(buildAutoJobDescription("frontend full-time")).toContain(FULL_TIME_FINGERPRINT);
    expect(buildAutoJobDescription("frontend full time")).toContain(FULL_TIME_FINGERPRINT);
    expect(buildAutoJobDescription("frontend fulltime")).toContain(FULL_TIME_FINGERPRINT);
  });

  it("internship check beats full-time check when both keywords appear", () => {
    // 两种关键词同时出现 / both keywords present
    const out = buildAutoJobDescription("社招 实习");
    expect(out).toContain(INTERNSHIP_FINGERPRINT);
    expect(out).not.toContain(FULL_TIME_FINGERPRINT);
  });

  it("emits no internship/full-time extras for a generic role", () => {
    const out = buildAutoJobDescription("前端工程师");
    expect(out).not.toContain(INTERNSHIP_FINGERPRINT);
    expect(out).not.toContain(FULL_TIME_FINGERPRINT);
  });
});

describe("buildAutoJobDescription — role label normalization", () => {
  it("rewrites English intern/internship tokens to 实习 in the 岗位名称", () => {
    expect(buildAutoJobDescription("frontend intern")).toMatch(/岗位名称: frontend 实习/);
    expect(buildAutoJobDescription("Frontend Internship")).toMatch(/岗位名称: Frontend 实习/);
  });

  it("rewrites English full-time / full time tokens to 全职 in the 岗位名称", () => {
    expect(buildAutoJobDescription("frontend full-time")).toMatch(/岗位名称: frontend 全职/);
    expect(buildAutoJobDescription("frontend full time")).toMatch(/岗位名称: frontend 全职/);
  });

  it("collapses runs of whitespace inside the role label", () => {
    expect(buildAutoJobDescription("frontend   intern")).toMatch(/岗位名称: frontend 实习/);
  });

  it("trims leading / trailing whitespace from the role label", () => {
    expect(buildAutoJobDescription("   前端工程师   ")).toMatch(/岗位名称: 前端工程师\n/);
  });

  it("leaves Chinese 实习 / 全职 unchanged in the label", () => {
    expect(buildAutoJobDescription("前端实习")).toMatch(/岗位名称: 前端实习/);
    expect(buildAutoJobDescription("全职后端")).toMatch(/岗位名称: 全职后端/);
  });
});
