# 网页品牌图标

网页当前使用统一的 `apps/web/public/logo.png` 和 `apps/web/public/favicon.ico`。侧栏的 `RecruitmentCopilotBrand` 加载 `/logo.png`，根路由声明 `/favicon.ico`，亮暗主题不切换另一套图标。

- Icon Composer 源文件：`apps/web/assets/icon-composer/app.icon/`。
- 导出脚本：`bun apps/web/scripts/export-brand-icons.ts`，需要 macOS、Xcode 和 Icon Composer；脚本从源文件生成中间 PNG，再输出网页 logo 和含 16、32、48、64、128、256px PNG 帧的 favicon。
- 输出 logo 为 256px；输出 favicon 保留透明度。
- 原有未被网页加载的亮色、暗色及多彩图标副本已移除。Desktop 的独立打包图标及源文件未在此清理中改动。
