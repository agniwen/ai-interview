# 首页背景与功能场景

首页和登录页当前采用蓝色光场，不再加载旧水彩城市、流程插画或截图素材。

## 当前实现

- `apps/web/src/components/features/home/background-layers.tsx` 组合背景、正文遮罩与可选的底部淡出；首页、登录布局及首页加载状态共用此组件。
- `hiring-shader-background.tsx` 在客户端水合后按主题和设备能力加载 WebGPU 光场；`hiring-shader.tsx` 实现动态效果。
- `apps/web/src/styles/globals.css` 的 `.home-hero-artwork-light` / `.home-hero-artwork-dark` 提供 CSS 渐变，用于 SSR、减少动画偏好及 WebGPU 不可用时的背景。
- `modern-artwork.tsx` 与 `.hiring-artwork` 提供功能场景的 CSS 装饰；首页产品展示直接渲染 `screens/` 中的交互演示，不使用静态页面截图。
- `apps/web/public/landing/grain.svg` 仍由 `page-grain.tsx` 引用，用于启用颗粒层的布局。

## 已移除的资源

旧水彩城市与功能插画、原始页面截图、对应 AVIF/WebP 优化副本及图片编码脚本已移除。旧绿色视频背景组件和未被任何页面启用的视频分支也已移除；不再提供 `images:home` 脚本。设计历史与验收报告保留在原有报告中，不代表当前页面实现。

调整背景时应同时检查亮暗主题、SSR 初始显示、减少动画偏好与 WebGPU 不可用的回退。
