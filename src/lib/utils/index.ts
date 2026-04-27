// oxlint-disable no-barrel-file -- 这是通用工具的统一入口；barrel 文件是有意为之。
//                                    Intentional barrel: single entry point for shared utilities.
/**
 * 通用工具函数统一入口。
 * Single entry point for shared utility helpers.
 *
 * 业务代码请优先 `import { cn, formatDate, ensureArray } from "@/lib/utils"`。
 * Prefer `import { cn, formatDate, ensureArray } from "@/lib/utils"` from app code.
 */

export * from "./cn";
export * from "./guards";
export * from "./array";
export * from "./object";
export * from "./format";
export * from "./time";
