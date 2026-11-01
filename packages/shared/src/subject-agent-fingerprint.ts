// 实体会话补丁的字段指纹（ADR-0045）：记录 agent 生成建议时被修改字段的原值，应用前据此判断
// 字段是否已被其他人或本人改过。FNV-1a 同步、同构，只用于变化检测，不用于安全场景。
// Field fingerprints for Subject Thread patches (ADR-0045). FNV-1a is synchronous and
// isomorphic; it only detects changes and is not a security primitive.
import { stableStringify } from "./stable-stringify";
import type { JsonValue } from "./stable-stringify";

// FNV-1a 32 位参数：offset basis 0x811C9DC5、prime 0x01000193（写成十进制以免格式化与 lint 冲突）。
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

function fnv1a(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const character of text) {
    // oxlint-disable-next-line no-bitwise -- FNV-1a is defined over 32-bit xor/multiply.
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, FNV_PRIME);
  }
  // oxlint-disable-next-line no-bitwise -- convert the signed 32-bit result to unsigned.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 空字符串、纯空白与 null 视为同一个“未填写”值；其余值按稳定序列化比较。 */
export function fingerprintSubjectAgentValue(value: JsonValue): string {
  if (value === null) {
    return fnv1a("");
  }
  if (!(value instanceof Object)) {
    return fnv1a(String(value).trim());
  }
  return fnv1a(stableStringify(value));
}

/** 生成时被修改字段的原值指纹，按字段名索引。 */
export function buildSubjectAgentBaseFingerprints<Field extends string>(
  fields: readonly Field[],
  readBase: (field: Field) => JsonValue,
) {
  return Object.fromEntries(
    fields.map((field) => [field, fingerprintSubjectAgentValue(readBase(field))]),
  );
}

/** 补丁生成后被改过的字段；补丁未记录原值时视为无冲突。 */
export function findSubjectAgentConflicts<Field extends string>(
  fields: readonly Field[],
  baseFingerprints: Partial<Record<string, string>>,
  readCurrent: (field: Field) => JsonValue,
): Field[] {
  return fields.filter((field) => {
    const base = baseFingerprints[field];
    return base !== undefined && base !== fingerprintSubjectAgentValue(readCurrent(field));
  });
}

/** 补丁中的字段值是否已与给定内容一致（用于判断补丁已填入或已保存）；fields 为补丁修改的字段。 */
export function subjectAgentValuesMatch<Field extends string>(
  fields: readonly Field[],
  readPatch: (field: Field) => JsonValue,
  readCurrent: (field: Field) => JsonValue,
): boolean {
  return fields.every(
    (field) =>
      fingerprintSubjectAgentValue(readPatch(field)) ===
      fingerprintSubjectAgentValue(readCurrent(field)),
  );
}
