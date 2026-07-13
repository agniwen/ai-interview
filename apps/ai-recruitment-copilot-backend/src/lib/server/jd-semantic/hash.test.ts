import { describe, expect, it } from "vitest";
import { hashJobDescriptionForSemanticIndex } from "./hash";

const base = {
  departmentName: "算法组",
  description: "负责推荐系统",
  id: "jd-1",
  name: "推荐算法工程师",
  prompt: "考察向量检索经验",
};

describe("hashJobDescriptionForSemanticIndex", () => {
  it("相同语义字段 → 相同 hash（id 不影响）", () => {
    expect(hashJobDescriptionForSemanticIndex(base)).toBe(
      hashJobDescriptionForSemanticIndex({ ...base, id: "jd-2" }),
    );
  });
  it("departmentName 变化 → hash 变化", () => {
    expect(hashJobDescriptionForSemanticIndex(base)).not.toBe(
      hashJobDescriptionForSemanticIndex({ ...base, departmentName: "工程组" }),
    );
  });
});
