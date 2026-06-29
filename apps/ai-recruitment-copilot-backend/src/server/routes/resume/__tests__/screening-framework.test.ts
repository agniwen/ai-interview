import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeDir = join(import.meta.dirname, "..");

function readRouteFile(path: string) {
  return readFileSync(join(routeDir, path), "utf-8");
}

describe("resume screening framework prompt", () => {
  it("uses the product six-dimension resume review framework", () => {
    const screeningSource = readRouteFile("screening.ts");
    const agentToolsSource = readRouteFile("utils/agent-tools.ts");
    const expectedDimensions = [
      "技能匹配度（35%）",
      "经验相关性（25%）",
      "项目匹配度（15%）",
      "学历/背景（10%）",
      "潜力评估（8%）",
      "稳定性评估（7%）",
    ];

    for (const dimension of expectedDimensions) {
      expect(screeningSource).toContain(dimension);
    }
    expect(screeningSource).toContain("基于六维度按 35/25/15/10/8/7 加权");
    expect(agentToolsSource).toContain("产品六维简历评分框架");
  });
});
