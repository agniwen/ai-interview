import { describe, expect, it } from "vitest";
import { normalizeGeneratedJobDescription } from "./ai-job-description-generate";

describe("normalizeGeneratedJobDescription", () => {
  it("restores markdown line breaks when the model replaces them with spaces", () => {
    expect(
      normalizeGeneratedJobDescription(
        "### 岗位职责  ----------------------------  1. **核心研发** 负责架构  2. 负责管理  ### 核心技能  ----------------------------  - **语言**：TypeScript  - **框架**：React",
      ),
    ).toBe(
      "### 岗位职责\n1. **核心研发** 负责架构\n2. 负责管理\n\n### 核心技能\n- **语言**：TypeScript\n- **框架**：React",
    );
  });
});
