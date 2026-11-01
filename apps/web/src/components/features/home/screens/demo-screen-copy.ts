import type { Locale } from "@/paraglide/runtime";
import { getLocale } from "@/paraglide/runtime";
import { enDemoScreenCopy } from "./demo-copy/en";
import { jaDemoScreenCopy } from "./demo-copy/ja";
import { koDemoScreenCopy } from "./demo-copy/ko";
import type { DemoScreenCopy } from "./demo-copy/zh-cn";
import { zhCNDemoScreenCopy } from "./demo-copy/zh-cn";

const DEMO_SCREEN_COPY = {
  en: enDemoScreenCopy,
  ja: jaDemoScreenCopy,
  ko: koDemoScreenCopy,
  "zh-CN": zhCNDemoScreenCopy,
} satisfies Record<Locale, DemoScreenCopy>;

/** 首页首屏演示窗口的文案与演示数据，跟随当前语言。 */
export function getDemoScreenCopy(): DemoScreenCopy {
  return DEMO_SCREEN_COPY[getLocale()];
}
