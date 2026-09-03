import { describe, expect, it } from "vitest";
import { buildJobDescriptionSemanticTexts } from "../resume-semantic/text-builders";
import type { JobDescriptionSemanticInput } from "../resume-semantic/text-builders";
import { hashJobDescriptionForSemanticIndex } from "./hash";

const base = {
  departmentName: "算法组",
  id: "jd-1",
  name: "推荐算法工程师",
  prompt: "考察向量检索经验",
};

const builderText = (jd: JobDescriptionSemanticInput) =>
  buildJobDescriptionSemanticTexts(jd)
    .map((chunk) => chunk.text)
    .join("\n");

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

  // 防漂移：凡改变语义向量文本的字段，都必须被 hash 覆盖，否则改内容不会触发重索引。
  // 若将来给 buildJobDescriptionSemanticTexts 加了新字段却漏改 hash，此测试会失败。
  it("hash 字段集 ⊇ 构造器消费字段集（改语义文本必改 hash）", () => {
    const baseText = builderText(base);
    const baseHash = hashJobDescriptionForSemanticIndex(base);
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    for (const key of Object.keys(base) as (keyof JobDescriptionSemanticInput)[]) {
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      const mutated = {
        ...base,
        [key]: `${base[key] ?? ""}__changed`,
      } as JobDescriptionSemanticInput;
      const changesText = builderText(mutated) !== baseText;
      const changesHash = hashJobDescriptionForSemanticIndex(mutated) !== baseHash;
      if (changesText) {
        expect(changesHash, `字段 "${key}" 影响语义向量但未纳入 hash`).toBe(true);
      }
    }
  });
});
