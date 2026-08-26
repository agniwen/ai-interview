# ReUI Filters 集成

## 来源与边界

2026-08-26 从 [ReUI Base Filters](https://reui.io/docs/components/base/filters) 的 `https://reui.io/r/base-nova/filters.json` 安装源码（shadcn CLI 4.18.0）。Filters 和 Cascader 源码放在 Web 与桌面 renderer 各自的 `components/reui/`；继续使用项目现有 Base UI primitives，不覆盖已有 Button、Popover 等组件，不新增运行时依赖。

业务接入只通过 `components/data-grid/parts/filter-config.ts`、`filter-query.ts`、`filter-conditions.tsx` 和 `toolbar.tsx`。字段声明决定允许的操作符，不能由客户端任意构造数据库条件。`unfilteredValue` 用于区分“移除条件”和资源默认值（例如归档列表默认 active，移除须传 all）。后台权限判断保持不变。

搜索与动作位于第一行，条件标签位于第二行。所有使用共享 Toolbar 的 DataGrid 和招聘/人才库列表同步接入。表单题、沟通题的归档菜单和邮箱日志日期控件也已移入条件区。只含关键词搜索的表格不额外显示空筛选栏。

## 上游源码的本地调整

- 基础条件标签以直接移除按钮替代高级菜单，不提供复制/否定；高级模式不向业务开放。标签限制最大宽度，长选项值截断，窄屏不撑开页面。
- 多选先保留本地草稿，点击“应用”提交，取消丢弃。避免每勾选一项请求一次。
- 无选中置顶时使用 CascaderVirtualItems（上游默认阈值 100），通过项目 ScrollArea 的原生 viewport 路径绑定实际滚动视口，避免一次挂载全部成员/岗位选项；选中置顶仍保留上游原路径。
- 删除两个未使用的上游局部变量，以通过桌面端严格 TypeScript 检查。
- 桌面端图标适配已有 Iconify Phosphor，Avatar 使用该端已有接口，并补充上游所需的 ButtonGroup 和 Spinner primitives。

更新 ReUI 时需同时同步两端并重新验证上述调整，不能直接覆盖项目 primitives。筛选草稿/条件转换和提交行为的回归测试位于 Web `components/data-grid/parts/__tests__/`；分页与选择重置测试位于 `components/data-grid/__tests__/`。

## 验收重点

1. 添加但尚未填写的条件、取消多选或日期编辑，不发出新筛选请求。
2. 多选应用仅提交一次；岗位/创建人 ANY、技能 ALL，与既有接口一致。
3. 删除默认归档条件请求 all，重置恢复 active；URL 重新加载能恢复已提交条件。
4. 改条件回第一页，清除旧勾选；固定行高、日期吸顶和无骨架后台刷新不变。
5. 成员/岗位长选项搜索、键盘选择和虚拟滚动可用；权限限定控件不可移除。

数据库结构、迁移及历史回填不属于此次改版。
