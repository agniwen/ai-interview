# Studio 侧面板

侧面板由 `components/features/studio/studio-layout.tsx` 提供宿主，使用 [foxact Magic Portal](https://foxact.skk.moe/magic-portal/) 将调用处的内容投射到右侧。内容保留调用处的 React Context；宿主不依赖具体业务类型。

## 接入

在页面或顶栏按钮所在组件中，始终挂载 `StudioSidePaneContent`，由它控制内容是否显示。ID 在同时挂载的所有调用方之间必须唯一；重复列表项可以使用 React `useId()`。

```tsx
import {
  StudioSidePaneContent,
  useStudioSidePane,
} from "@/components/features/studio/studio-side-pane-context";
import { StudioSidePaneHeader } from "@/components/features/studio/studio-side-pane-header";
import { Button } from "@/components/ui/button";

export function NotesButton() {
  const pane = useStudioSidePane("candidate-notes");
  return (
    <>
      <Button {...pane.triggerProps}>笔记</Button>
      <StudioSidePaneContent id="candidate-notes">
        <StudioSidePaneHeader title="笔记" />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* 在这里放业务组件，内部可以读取调用方的 Context。 */}
        </div>
      </StudioSidePaneContent>
    </>
  );
}
```

`triggerProps` 包含切换点击事件及 `aria-expanded` / `aria-controls`。自定义入口可以调用 `pane.open()`、`pane.close()`，用 `pane.isOpen` 设置选中样式。标题组件的 `actions` 接收刷新等操作，关闭按钮由标题组件统一提供。

## 加载状态（强制规范）

所有 sidepane 必须遵守，新增入口和修改现有入口时都要检查：

- 面板打开或切换内容时，只要所需数据尚未就绪，正文必须立即展示骨架屏，不能留白，也不能只展示转圈图标或“正在加载”文字。
- 保留标题、关闭按钮和可用的分类控件。骨架结构应接近最终内容，避免加载完成后明显跳动；列表可复用 `StudioSidePaneSkeleton`，其他内容使用现有 `Skeleton` 组件编排。
- 请求使用 `isPending` 等首次无数据状态控制骨架。已有可用缓存或后台刷新时继续展示现有内容，不用骨架替换整块内容；分页追加只在列表末尾显示加载反馈。
- 空状态只能在请求成功且确实没有数据时出现；失败时展示错误和重试入口，不能让骨架无限持续。
- 加载区域提供可访问的加载说明及 `aria-busy`，装饰性骨架对读屏隐藏。异步组件使用 Suspense 时，fallback 也必须是相应骨架屏。
- 验收时检查慢速首次打开、不同面板之间切换、缓存重开、空数据和请求失败。

上传任务与审批面板已按此规范接入。骨架由业务内容组件提供，通用宿主不推断业务数据是否就绪。

## 生命周期和职责

- 同时仅显示一个 ID。打开另一个内容会替换当前内容。
- 移动端关闭时先将 Drawer 设为关闭状态，保留内容到退场完成后再卸载；使用 Drawer 的完成回调，不逐帧更新 React 状态或尺寸。动画仅使用 transform / opacity；减少动态效果模式直接关闭，旧回调不得影响重新打开的内容。
- 关闭后内容卸载；请求、轮询等副作用放在内容子组件中。上传任务仅在打开时轮询，查询缓存仍由 TanStack Query 管理。
- 页面内的来源组件卸载时关闭它所属的面板；旧来源清理不会关闭其他 ID 的面板。全局顶栏来源可以跨页面保留。
- 切换工作区通过 Provider 的 `scopeKey` 关闭面板，返回旧工作区不会恢复之前的打开状态。
- 业务入口负责权限检查、数据请求和业务操作；布局宿主仅负责展示、响应式布局及关闭交互。
- Magic Portal 在客户端目标挂载后呈现内容，不依赖服务端渲染面板正文。

## 布局与交互

桌面端（视口至少 1024px）使用独立 surface，与主内容保持 8px 间隔、16px 圆角及相同背景和阴影；标题高度为 48px。内容区继续占满剩余高度，每个面板自行管理滚动。默认不添加描述或底部计数。

窄屏使用 `direction="right"` 的 Drawer，从右向左滑入，支持向右拖动关闭、点击遮罩及关闭按钮。抽屉占满可用高度，左侧保留 16px 遮罩空间，宽度最多 26rem，避免进一步挤压主内容。切换桌面/窄屏时内容可能重新挂载，需持久保留的草稿应放在来源组件或业务存储中。

桌面面板打开时获得焦点，主内容仍可操作；面板内 Escape 关闭，文件预览等 portal 弹窗的 Escape 不会误关面板。主动关闭后焦点返回仍存在的触发元素。

主内容保留原有居中 `max-w-[96rem]` 容器、顶栏渐变及滚动恢复。布局行是 `@container/studio-workspace`，正文使用 `100cqw` 获取包含主内容和面板的完整可用宽度。打开面板仅缩小主内容的可视区域，不改变正文宽度或卡片排版；溢出由主内容的横向滚动条承接；正文本身较窄（如 `max-w-4xl` 的编辑页）的页面在其容器上标记 `data-studio-fit-width`，正文改为跟随可视宽度，避免出现不必要的横向滚动条。关闭面板后恢复完整可视区域。窗口尺寸变化或左侧 sidebar 展开/收起仍正常调整正文宽度。顶栏固定在可视区域内，按钮始终可操作。

## 已接入入口

顶栏的审批、上传任务入口仅在一级页面（含面试题的分类页签）展示；详情页及编辑页隐藏。进入这些页面时来源组件卸载，所属面板随之关闭，主题切换保持可用。

- 上传任务：顶栏 Inbox 图标，展示解析任务与文件预览。
- 审批：顶栏审批图标，沿用 `page.offerApprovals` 权限。面板复用审批列表查询与 15 秒轮询，支持待我审批、我已处理、我发起的分类；有管理权限时显示全部。点击记录进入原审批详情，原列表 URL 仍可访问。分页控制随列表内容滚动，不添加固定底部统计栏。

## 详情页操作与卡片表面

- 详情和页面化编辑器的页面级动作（保存、取消、审批、催办、刷新等）统一使用 `FloatingBar`。普通详情页使用 `StudioPageActions`，锚定主内容区域，避免随正文滚走或覆盖右侧 sidepane；全屏画布可沿用 `EditorWorkspaceSurface` 的浮动操作栏。
- 正文底部为浮动操作栏保留空间。表单按钮通过 `form` 属性关联表单，移到 Portal 后也必须保留提交、校验和 pending/disabled 行为。
- 返回导航、行内删除/排序、具体记录的重试等上下文操作保留在对应位置，不重复放入页面操作栏。已有候选人流程 Dock 保持原来的交互。
- 卡片表面默认使用不透明的 `bg-card text-card-foreground` 与现有圆角、`shadow-default`：亮色模式为纯白，区别于略灰的 `bg-background` 页面底色；深色模式使用主题卡片底色。画布底层、选中/hover 状态可以使用语义背景色；不要用半透明色代替卡片自身的背景。

岗位和沟通题的新建与编辑共用页面布局，`new` 是新建路径标识，不请求详情接口。列表入口沿用 masked overlay 路由；首次保存成功以 `replace` 跳转到返回 ID 的编辑页，后退仍返回来源列表。标题、说明和页签随正文滚动，不单独吸顶；岗位与沟通题表单保持单列。
