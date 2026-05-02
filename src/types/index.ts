// oxlint-disable no-barrel-file -- 这是项目共享类型的统一入口；barrel 文件是有意为之。
//                                    Intentional barrel: single entry point for shared types.
/**
 * 项目类型统一入口。
 * Single entry point for shared project types.
 *
 * 业务代码请优先从这里导入：`import type { Nullable, ResumeProfile } from "@/types"`。
 * 这样未来重命名底层文件时，只需调整本目录的 re-export 即可。
 *
 * Prefer importing from this barrel: `import type { Nullable, ResumeProfile } from "@/types"`.
 * Renaming underlying files only requires touching this folder.
 */

export * from "./common";
export * from "./interview";
export * from "./chat";
export * from "./studio";
