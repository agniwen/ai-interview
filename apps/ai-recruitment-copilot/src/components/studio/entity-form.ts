"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useRef } from "react";

// Standard Schema v1 协议（Zod 4 实现该协议）；@standard-schema/spec 不是直接 dep，
// 这里只取 TanStack Form 验证器需要的最小 shape。
// Minimal Standard Schema v1 shape (Zod 4 implements this protocol).
// `@standard-schema/spec` isn't a direct dep; we inline the slice we need.
interface StandardSchemaLike<TValues> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { value: TValues }
      | { issues: readonly { message: string }[] }
      | Promise<{ value: TValues } | { issues: readonly { message: string }[] }>;
    readonly types?: { input: TValues; output: unknown };
  };
}

interface UseEntityFormOptions<TValues> {
  /**
   * 弹窗打开时（`open` 变 true）会重新调用以拿到最新 defaultValues。
   * 调用方应把 record-derived 转换写在这里，比如：
   *   `buildValues: () => (record ? toFormValues(record) : defaultValues())`
   *
   * Resolved each time `open` flips to true. Wrap any record-derived
   * transformation here so the form picks up the latest values when the
   * dialog reopens for a different record.
   */
  buildValues: () => TValues;
  /** 任意 Standard Schema 验证器（Zod 4 直接兼容）。 */
  schema: StandardSchemaLike<TValues>;
  onSubmit: (value: TValues) => Promise<void> | void;
  /** Dialog open state — used as the reset trigger. */
  open: boolean;
}

/**
 * 抽出 EntityFormDialog 系列共用的 useForm + isSubmitting + open-reset 三段式。
 * 把可见 UI 留给调用方 —— 这里只管 form 实例与提交态。
 *
 * Captures the boilerplate trio shared across simple Studio form dialogs:
 * `useForm` setup, the `isSubmitting` selector, and the open→reset effect.
 * Visible UI stays with the caller.
 */
export function useEntityForm<TValues>({
  buildValues,
  schema,
  onSubmit,
  open,
}: UseEntityFormOptions<TValues>) {
  const form = useForm({
    defaultValues: buildValues(),
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onSubmit: schema },
  });
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  // 用 ref 把最新的 buildValues 透到 useEffect 里，让依赖数组只跟 open 变化。
  // 调用方传入的箭头函数每次渲染都是新引用，直接放进 deps 会导致每渲染 reset 一次。
  // Hold the latest buildValues in a ref so the effect can depend solely on `open` —
  // the inline arrow passed by callers is fresh per render and would otherwise
  // re-fire reset every commit.
  const buildValuesRef = useRef(buildValues);
  buildValuesRef.current = buildValues;

  useEffect(() => {
    if (open) {
      form.reset(buildValuesRef.current());
    }
  }, [open, form]);

  return { form, isSubmitting };
}
