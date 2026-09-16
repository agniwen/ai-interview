import { describe, expect, it } from "vitest";
import {
  DASHBOARD_METRIC_DEFINITION_GROUPS,
  DASHBOARD_SCOPE_NOTE,
} from "./dashboard-metric-definitions";

describe("dashboard metric definitions", () => {
  it("documents the agreed scope and calculation rules without claiming auto refresh", () => {
    const copy = [
      DASHBOARD_SCOPE_NOTE,
      ...DASHBOARD_METRIC_DEFINITION_GROUPS.flatMap((group) => [
        group.title,
        ...group.items.flatMap((item) => [item.label, item.definition]),
      ]),
    ].join("\n");

    expect(copy).toContain("当前工作区");
    expect(copy).toContain("不包含已归档候选人");
    expect(copy).toContain("重新进入或刷新页面时重新计算");
    expect(copy).toContain("岗位缺口");
    expect(copy).toContain("计划人数减去已入职人数");
    expect(copy).toContain("进入复面");
    expect(copy).toContain("进入 Offer／待入职");
    expect(copy).toContain("本环节累计人数除以上一环节累计人数");
    expect(copy).toContain("按招聘记录创建人汇总");
    expect(copy).toContain("按候选人招聘记录去重");
    expect(copy).toContain("全部未配置时显示为“—”");
    expect(copy).toContain("招聘记录数");
    expect(copy).not.toContain("负责候选人");
    expect(copy).not.toContain("负责人名下");
    expect(copy).not.toContain("通过二面");
    expect(copy).not.toContain("自动刷新");
    expect(copy).not.toContain("数据更新时间");
  });
});
