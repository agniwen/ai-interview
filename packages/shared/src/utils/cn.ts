import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 Tailwind class 名称的工具函数：先用 `clsx` 处理条件，再交给 `tailwind-merge`
 * 去重相互冲突的 class（例如 `px-2 px-4` → 保留 `px-4`）。
 *
 * Combines Tailwind class names. `clsx` handles conditionals and `tailwind-merge`
 * deduplicates conflicting classes (e.g. `px-2 px-4` collapses to `px-4`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
