# 面试入口点阵背景

`InterviewEntryBackground`（`apps/web/src/components/features/interview/interview-background.tsx`）为候选人入口页提供背景：页面底色 `bg-background`，叠加一层 Canvas 2D 绘制的闪烁小方块点阵（参考 Metaview 的筛选面试入口）。AI 面试入口、表单与加载页，以及真人面试入口（经 `InterviewEntryShell`）复用此背景。

- 点阵：7px 网格、2px 方块；亮色为近黑色、暗色为白色，整层透明度 50%。
- 每个方块从 8% / 16% / 24% / 36% 中随机取透明度，约每 5 秒错峰换一次；加载时从中心向外显现。
- 一层缓慢漂移的低频噪声（两个八度）给点阵加权，形成有深有浅的颗粒斑块。
- 径向遮罩让中心内容区的颗粒很浅、向四周逐渐加深。系统开启「减少动态效果」时绘制静态点阵。
- 面试进行中与面试结束页只使用 `bg-background`，不叠加点阵。

原抽象光线 WebP 背景已移除。
