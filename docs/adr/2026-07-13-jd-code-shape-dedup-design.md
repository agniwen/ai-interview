# JD 编码形状去重（消除跨文件长度漂移）设计

> 日期：2026-07-13 · 状态：待评审

## 背景与目标

JD「编码」（`job_description.code`）的形状 = **3 位前缀 + 4 位 base36 后缀 = 7 位大写字母数字**。这套「3 / 4 / 7」的形状知识目前**散落在四处、各自硬编码**，没有单一真源。其中：

- 生成器（backend）用 `36 ** 4`、`padStart(4)`、`/^[A-Z0-9]{3}$/`。
- 邮件主题抽取器（worker）用另一份独立正则 `/(^|[^A-Za-z0-9])(?<code>[A-Za-z0-9]{7})(?=$|[^A-Za-z0-9])/g`。

两者物理上在不同 app、无任何共享常量。**改了生成规则，抽取器不会跟着变**——这是本设计要消除的**潜在漂移**。

### 这不是线上正确性 bug

绑定的唯一裁决是 `fetchJobDescriptionsByCodes(organizationId, codes)` 的 org 内 DB 回查（`dao.ts:451`）：

- 随机 7 位噪声词几乎不可能等于某个真实存储的 code → 不会误绑。
- 跨组织码被 `eq(organizationId)` + `(organizationId, code)` 唯一索引挡掉 → 天然隔离。
- 多码撞多岗（歧义）只会 fallback、绝不误绑（`processor.ts:160-176`）。

因此本期修的是**两条卫生/健壮性问题**，而非线上故障：

1. **长度漂移**：`{7}` 与 `3+4` 在不同文件、无共享常量，改一处不会联动另一处。
2. **常量重复**：`DEFAULT_JOB_CODE_PREFIX = "AUR"` 与 prefix 校验正则 `/^[A-Z0-9]{3}$/` 各有两份拷贝。

## 明确不做（YAGNI）

- **前缀参数化 / 降噪**（把 org 的 `jobCodePrefix` 引到 worker、抽取只认当前前缀）——即评审中的 B/C 档，本期不做。理由见下「前缀可变性」：抽取保持**前缀无关**反而是对可变前缀最鲁棒的选择。
- **变长前缀**：当前前缀长度被校验钉死为 3 位（两处），本设计据此把总长视为固定 7 位。变长前缀是**已知的未来项**，届时把单个 `JOB_CODE_LENGTH` 换成长度区间 `{MIN,MAX}` 即可（因已收敛到共享常量，是「改 1 处」）。
- 不改 `schema.ts:2130` 列默认值 `"AUR"`（存储默认，非形状逻辑；drizzle 列默认需静态字面量）。
- 不碰 worker 的 `resolveMailJobBinding` 管道、不改绑定/歧义行为。

## 现状：形状知识的四处重复

| 位置                                                                     | 硬编码的形状知识                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `packages/shared/src/global-config.ts:3,15`                              | `DEFAULT_JOB_CODE_PREFIX = "AUR"`；prefix 正则 `/^[A-Z0-9]{3}$/`     |
| `apps/…/job-descriptions/utils/job-description-code.ts:1,3,7,12`         | 本地又一份 `"AUR"`；`36 ** 4`；`padStart(4, "0")`；`/^[A-Z0-9]{3}$/` |
| `apps/ai-recruitment-copilot-worker/src/mail-ingest/message-filter.ts:3` | 抽取正则 `[A-Za-z0-9]{7}`                                            |
| `packages/db-schema/src/schema.ts:2130`                                  | 列默认值 `"AUR"`（存储默认，**不动**）                               |

`@arc/shared` 的 exports 为 `"./*": "./src/*.ts"` 通配 → 新增 `@arc/shared/job-code` **无需改 package.json**。worker 的 `message-filter.ts` 已 import `@arc/shared/resume-documents`，跨包引用已验证可行。

## 设计：单一真源 `@arc/shared/job-code.ts`

新建模块，作为 JD 码形状的唯一真源；其余三处派生自它。

```ts
// packages/shared/src/job-code.ts
export const DEFAULT_JOB_CODE_PREFIX = "AUR";
export const JOB_CODE_PREFIX_LENGTH = 3;
export const JOB_CODE_SUFFIX_LENGTH = 4;
export const JOB_CODE_LENGTH = JOB_CODE_PREFIX_LENGTH + JOB_CODE_SUFFIX_LENGTH; // 7
export const JOB_CODE_SUFFIX_RADIX = 36;
export const JOB_CODE_SUFFIX_RANDOM_SPACE = JOB_CODE_SUFFIX_RADIX ** JOB_CODE_SUFFIX_LENGTH; // 36**4
export const JOB_CODE_CHAR_CLASS = "A-Z0-9"; // 大写 base36 字母数字

// prefix 校验（非 global 正则，配 .test() 无状态）
export const JOB_CODE_PREFIX_PATTERN = new RegExp(
  `^[${JOB_CODE_CHAR_CLASS}]{${JOB_CODE_PREFIX_LENGTH}}$`,
);

// 邮件主题抽取 pattern：边界 + 命名组 code + g flag，长度/字符集派生
export function buildJobCodeSubjectPattern(): RegExp {
  return new RegExp(
    `(^|[^${JOB_CODE_CHAR_CLASS}])(?<code>[${JOB_CODE_CHAR_CLASS}]{${JOB_CODE_LENGTH}})(?=$|[^${JOB_CODE_CHAR_CLASS}])`,
    "g",
  );
}
```

### 三处派生改造

- **`message-filter.ts`**：`const JOB_CODE_IN_SUBJECT_PATTERN = buildJobCodeSubjectPattern();`（仍是模块级单例，满足 oxlint「regex 不在循环里」）。字符集由 `[A-Za-z0-9]` 收敛为 `[A-Z0-9]`。
- **`job-description-code.ts`**：`36 ** 4` → `JOB_CODE_SUFFIX_RANDOM_SPACE`；`padStart(4, "0")` → `padStart(JOB_CODE_SUFFIX_LENGTH, "0")`；`.toString(36)` → `.toString(JOB_CODE_SUFFIX_RADIX)`；`/^[A-Z0-9]{3}$/` → `JOB_CODE_PREFIX_PATTERN`；本地 `DEFAULT_JOB_CODE_PREFIX` 改为 `export { DEFAULT_JOB_CODE_PREFIX } from "@arc/shared/job-code"`（保留既有 importer 的 back-compat）。
- **`global-config.ts`**：`DEFAULT_JOB_CODE_PREFIX` 改为从 `@arc/shared/job-code` re-export（`@arc/shared/global-config` 的 importer 不受影响，如 `global-config/dao.ts:4`）；`jobCodePrefixSchema` 的正则用 `JOB_CODE_PREFIX_PATTERN`，错误文案 `${JOB_CODE_PREFIX_LENGTH} 位` 模板化。

### 行为等价性论证（A = 零行为变更）

- **字符集收敛安全**：抽取前已 `subject.toUpperCase()`（`message-filter.ts:51`），匹配时不存在小写字母，故 `[A-Za-z0-9]` 与 `[A-Z0-9]` **行为完全一致**。现有 `aurzz99 → AURZZ99` 测试正是这条「先大写再匹配」管线的证明，改造后必须继续通过。
- **长度不变**：`JOB_CODE_LENGTH` 求值恒为 7，与原字面量一致。
- **regex 结构不变**：边界 `(^|[^…])`、lookahead `(?=$|[^…])`、命名组 `code`、`g` flag 全部保留；`matchAll` 对传入的 global 正则会内部克隆，模块级单例安全。
- **prefix 校验不变**：`JOB_CODE_PREFIX_PATTERN` 非 global，`.test()` 无状态。

## 前缀可变性（记录分析结论）

`globalConfig.jobCodePrefix` 可被修改，但对本设计**无影响**，且是选 A（而非 B/C）的核心理由：

- **code 只在创建时生成一次、永不重算**：PATCH 仅在 `!existing.code && input.code` 时补写、从不覆盖（`route.ts:473`）；改前缀的 global-config DAO 只更新 `global_config` 行、不动任何 `jobDescription`。故改前缀后老 JD 保留老前缀码，一个 org 内前缀可混存。
- **前缀 VALUE 可变，但 LENGTH 被钉死为 3 位**（`global-config.ts:15` + `job-description-code.ts:12`）→ code 长度恒为 7。A 共享的是「长度 = 3 + 4 = 7」这个不变式，不是前缀的值。
- **抽取保持前缀无关** → 老码新码一视同仁地提取，DB 回查按实际存储 code 裁决，完全不受前缀变更影响。若改成 B/C 的「锚定当前前缀」，org 改过前缀后会漏掉老前缀历史码——A 正好避开。
- **唯一 caveat（已列入「明确不做」）**：A 隐含「总长固定 7 位」，仅因前缀被校验成恰好 3 位而成立。若将来支持变长前缀，需把 `JOB_CODE_LENGTH` 换成长度区间；收敛到共享常量后是「改 1 处」。

## 测试：以共享真源打通防漂移

生成器在 backend、抽取器在 worker，跨 app 不便同测。防漂移保证靠**两侧测试引用同一份 `@arc/shared/job-code`**：改 `JOB_CODE_SUFFIX_LENGTH`，生成器产更长码、抽取 pattern 认更长码、两侧断言（`toHaveLength(JOB_CODE_LENGTH)` + 用 `buildJobCodeSubjectPattern()` 提取）同时更新，即证同步。

- **新 `packages/shared/src/job-code.test.ts`**：形状不变式（`JOB_CODE_LENGTH === JOB_CODE_PREFIX_LENGTH + JOB_CODE_SUFFIX_LENGTH === 7`）；`buildJobCodeSubjectPattern()` 命中合成码 `PREFIX + "0".repeat(SUFFIX_LENGTH)`，且拒绝长度 ±1 的 token；`JOB_CODE_PREFIX_PATTERN` 收 3 位、拒 2/4 位与非法字符。
- **扩 `job-description-code.test.ts`**：`generateJobDescriptionCode(...)` 输出 `length === JOB_CODE_LENGTH` 且被共享 `buildJobCodeSubjectPattern()` 命中（把生成器绑到共享形状）。
- **保 `message-filter.test.ts`**：`AUR00AZ` / `AURZZ99`（来自 `aurzz99`）/ `HRD00AZ` / 超长串 `AUR26062215347` 不匹配等既有用例**原样通过**。

## 改动文件清单

- 新建：`packages/shared/src/job-code.ts`、`packages/shared/src/job-code.test.ts`
- 修改：`packages/shared/src/global-config.ts`
- 修改：`apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.ts`
- 扩测：`apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.test.ts`
- 修改：`apps/ai-recruitment-copilot-worker/src/mail-ingest/message-filter.ts`

## 验证

- `pnpm --filter @arc/shared test && pnpm --filter @arc/shared typecheck`
- `pnpm --filter @arc/ai-recruitment-copilot-backend test job-description-code && pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
- `pnpm --filter @arc/ai-recruitment-copilot-worker test message-filter && pnpm --filter @arc/ai-recruitment-copilot-worker typecheck`
- `pnpm fix`（oxlint/oxfmt 门）

## 风险

- 近乎零行为变更；唯一需守住的等价性是「字符集收敛在 uppercase 之后安全」——由保留 `aurzz99 → AURZZ99` 用例守卫。
- `@arc/shared/job-code` 新增子路径由通配 export 覆盖，无需改 package.json；若 CI 的 `@arc/shared` 构建对新增文件有额外要求，在实现时确认。
