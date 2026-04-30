# DataGrid 组件设计

**日期**: 2026-04-28
**作者**: allen
**状态**: 设计稿（已通过头脑风暴对齐）

## 1. 背景

`/studio` 下有 6 个 management 页面：

| 页面                                              | 行数 | 用了 TanStack Table | 列固定 | 行选择 + 批量 | 排序 | 额外筛选 |
| ------------------------------------------------- | ---- | ------------------- | ------ | ------------- | ---- | -------- |
| `interview-management-page.tsx`                   | 630  | ✅                  | ✅     | ✅            | ✅   | status   |
| `interviewer-management-page.tsx`                 | 513  | ❌                  | ❌     | ❌            | ❌   | -        |
| `form-template-management-page.tsx`               | 568  | ❌                  | ❌     | ❌            | ❌   | -        |
| `interview-question-template-management-page.tsx` | 538  | ❌                  | ❌     | ❌            | ❌   | -        |
| `department-management-page.tsx`                  | 429  | ❌                  | ❌     | ❌            | ❌   | -        |
| `job-description-management-page.tsx`             | 538  | ❌                  | ❌     | ❌            | ❌   | -        |

合计约 3216 行，全部共享相同的结构骨架：

1. SSR initial data → React Query 注入 + `placeholderData` 平滑切换
2. 搜索框 (`useDeferredValue` debounce) + 可选 Select 筛选 + Refresh + Create 按钮
3. shadcn `<Card><Table>` 包裹的列表 / `<Empty>` 空态
4. 自定义分页栏（首页/上一页/下一页/末页 + pageSize Select + 范围信息）
5. 删除确认 `AlertDialog` + 编辑/创建 Dialog

差异主要集中在 `interviews`：列固定、排序、行选择、批量删除、顶部统计卡片。

## 2. 目标

抽象一个统一的 `DataGrid` 组件 + 配套 `useDataGridState` hook，覆盖以上所有用例，并满足：

- **易用**：调用方代码量明显减少（预期 6 个页面共减少 60%+ 代码量）
- **易扩展**：复杂场景能通过原生 `ColumnDef<T>` / slot 逃生通道实现
- **性能好**：保持 React Query 受控、`placeholderData` 平滑、按需开启行虚拟化的可能性
- **URL sync**：分页 / 搜索 / 筛选 / 排序同步到 URL（client-only）

## 3. 关键决策

| 决策                             | 选择                                   | 理由                                                                   |
| -------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| 数据获取归属                     | **C：受控组件 + 配套 hook**            | 兼容现有 SSR seed 模式；外部仍可用 React Query 全部能力；hook 消除样板 |
| 列定义风格                       | **TanStack `ColumnDef<T>[]` + 列工厂** | 简单页面用工厂消重复，复杂列直接传原生 ColumnDef                       |
| Toolbar API                      | **声明式筛选 + slot 兜底**             | 内置 search / select 覆盖 100% 现有用例；slot 给创建/批量按钮          |
| URL sync                         | **开启，client-only**                  | 不改 `page.tsx`；URL → state 只在 mount 读一次，后续单向 state → URL   |
| 行选择 / 批量操作                | **render prop**                        | 撑得住 confirm dialog、loading、自定义文案                             |
| 迁移范围                         | **6 个页面一次性全迁**                 |                                                                        |
| Virtualization / 列显隐 / 列拖拽 | **不做**                               | YAGNI；最大 pageSize=100，无性能压力                                   |

## 4. 目录结构

```
src/components/data-grid/
  data-grid.tsx              # 主组件
  use-data-grid-state.ts     # 状态 + URL sync + React Query 接线 + SSR seed
  use-url-state.ts           # URL <-> state 同步（client-only, shallow router.replace）
  columns/
    select-column.tsx
    text-column.tsx
    badge-column.tsx
    date-column.tsx
    actions-column.tsx
    custom-column.tsx
  parts/
    toolbar.tsx
    pagination-bar.tsx
    pinned-cell.tsx          # 提升自 interviews 的 get-pinning-styles.ts
  index.ts                   # barrel：仅导出公共 API（DataGrid, useDataGridState, 列工厂）
```

公共约定：

- `PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100]`，默认 `pageSize = 10`
- 排序：单列、`manualSorting: true`（server-side）
- 列固定样式：复用现有 `getPinningStyles` 逻辑（hover/selected 背景色保持）

## 5. API 详细设计

### 5.1 `<DataGrid<T>>` 受控接口

```ts
interface DataGridProps<T> {
  // 数据（受控）
  data: T[];
  total: number;
  loading?: boolean; // 初次/筛选切换时
  refetching?: boolean; // 数据变更后刷新（仅 spinner 提示，不淡化整表）

  // 列
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  columnPinning?: { left?: string[]; right?: string[] };

  // 分页（受控）
  pagination: {
    page: number;
    pageSize: number;
    onPageChange: (p: number) => void;
    onPageSizeChange: (s: number) => void;
    pageSizeOptions?: readonly number[];
  };

  // 排序（受控，可选）
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;

  // 行选择（可选）
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  // Toolbar
  filters?: DataGridFilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  toolbarRight?: ReactNode;
  bulkActions?: (ctx: BulkActionContext<T>) => ReactNode;
  headerExtra?: ReactNode; // toolbar 上方区域（interviews 的统计卡片）

  // 空态
  empty: ReactNode;

  // 刷新（不传则不显示按钮）
  onRefresh?: () => void;

  // a11y / tutorial 锚点
  dataTour?: {
    table?: string;
    search?: string;
    filters?: Partial<Record<string, string>>; // key -> data-tour 值
    create?: string; // 用于 toolbarRight 容器
    stats?: string; // 用于 headerExtra 容器
  };
}

type DataGridFilterConfig =
  | { type: "search"; key: string; placeholder?: string; minWidth?: string }
  | {
      type: "select";
      key: string;
      placeholder?: string;
      options: { value: string; label: string }[];
    };

interface BulkActionContext<T> {
  selectedIds: string[];
  selectedRows: T[];
  clearSelection: () => void;
}
```

设计要点：

- **完全受控**。所有 state 在外面，组件只渲染。给 SSR seed / tutorial mock 留出空间。
- **search 内部 debounce**。组件包一层 `useDeferredValue` + 自动显示 loading spinner。
- **bulk actions 在 `toolbarRight` 之前自动渲染**，仅当 `selectedCount > 0` 时显示。
- **action 列 pinned right** 由列工厂自动设置，无需调用方在 `columnPinning.right` 重复声明（但可手动覆盖）。

### 5.2 `useDataGridState` 配套 hook

```ts
function useDataGridState<T, F extends Record<string, string>>(opts: {
  namespace: string; // queryKey 前缀 + URL key 命名空间
  fetcher: (
    params: DataGridFetchParams<F>,
  ) => Promise<{ records: T[]; total: number; totalPages: number }>;
  initialData: { records: T[]; total: number; totalPages: number; page: number; pageSize: number };
  defaultPageSize?: number; // 默认 10
  defaultSorting?: SortingState; // 默认 []
  initialFilters: F; // e.g. { status: 'all' }
  syncToUrl?: boolean; // 默认 true（client-only）
  staleTime?: number; // 默认 30_000
}): {
  // 受控状态
  page: number;
  pageSize: number;
  search: string;
  deferredSearch: string;
  filters: F;
  sorting: SortingState;
  rowSelection: RowSelectionState;

  // setters
  setPage;
  setPageSize;
  setSearch;
  setFilter;
  setSorting;
  setRowSelection;

  // 派生
  data: { records: T[]; total: number; totalPages: number };
  loading: boolean;
  refetching: boolean;
  queryKey: readonly unknown[];
  invalidate: () => void;

  // 一把抓：直接展开到 <DataGrid>
  bind: Pick<
    DataGridProps<T>,
    | "data"
    | "total"
    | "loading"
    | "refetching"
    | "pagination"
    | "sorting"
    | "onSortingChange"
    | "rowSelection"
    | "onRowSelectionChange"
    | "filterValues"
    | "onFilterChange"
    | "onRefresh"
  >;
};

interface DataGridFetchParams<F> {
  page: number;
  pageSize: number;
  search: string;
  filters: F;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}
```

内部职责：

1. `useState` 管理所有筛选/分页/排序状态，初值优先来自 URL（mount 时单次读取），fallback 到 `initialFilters`/默认值
2. `useDeferredValue` debounce search
3. 筛选/搜索/排序变化 → `setPage(1)`（封装"重置页码"）
4. `useQuery({ queryKey, queryFn: fetcher, placeholderData: prev, staleTime })`
5. `queryClient.setQueryData(queryKey, initialData)` 一次性 seed（用 ref 锁，仅 mount 时执行一次，且仅当 URL 不带参数）
6. `useEffect` 把状态变化用 `router.replace(?..., { scroll: false })` shallow 推到 URL（仅 client-only；search 用 debounce 后的值）
7. `invalidate()` = `queryClient.invalidateQueries({ queryKey: [namespace] })`
8. `data` 始终通过 `data ?? initialData` 兜底；`bind` 把 hook 的 `data.records` 拆成 `<DataGrid>` 的 `data` prop、`data.total` 拆成 `total` prop（即 hook 内部持有"包装对象"，对外 `bind` 已铺平）

**注意**：URL sync 用 `router.replace` shallow 更新，不会产生新的 history entry。也就是说浏览器"后退"按钮不会撤销筛选变化（这与传统 URL sync 行为不同，刻意为之以避免双向同步循环；后续如需要可改为 `push` + 单向 effect 锁）。

URL key 规则（扁平）：`?page=2&pageSize=20&search=xxx&status=ready&sortBy=createdAt&sortOrder=desc`。
默认值不写入 URL（保持 URL 简洁）。

### 5.3 列工厂签名

```ts
selectColumn<T>(): ColumnDef<T>

textColumn<T>(opts: {
  key: keyof T & string                     // 同时作 accessorKey 和 id
  title: string
  primary?: boolean                         // 粗体
  secondary?: (row: T) => ReactNode         // 双行：第二行 muted
  fallback?: string                         // value 为空时显示
  muted?: boolean                           // 整体 muted
  truncate?: boolean | string               // true = max-w-sm；string = 自定义类名（如 'max-w-48'）
  size?: number
  cell?: (row: T) => ReactNode              // 自定义渲染（覆盖默认）
}): ColumnDef<T>

badgeColumn<T>(opts: {
  key: keyof T & string
  title: string
  meta?: Record<string, { label: string; tone: BadgeVariant }>   // 简单映射
  cell?: (row: T) => ReactNode                                    // 复杂场景自定义
  size?: number
}): ColumnDef<T>

dateColumn<T>(opts: {
  key: keyof T & string
  title: string
  sortable?: boolean
  options?: Intl.DateTimeFormatOptions       // 默认 DATE_TIME_DISPLAY_OPTIONS
}): ColumnDef<T>

actionsColumn<T>(opts: {
  inline?: Array<{
    icon: LucideIcon
    label: string                            // tooltip + aria-label
    onClick: (row: T) => void | Promise<void>
    disabled?: (row: T) => boolean
    show?: (row: T) => boolean
  }>
  menu?: Array<{
    icon?: LucideIcon
    label: string
    onClick: (row: T) => void | Promise<void>
    variant?: 'default' | 'destructive'
    separator?: 'before'
    show?: (row: T) => boolean
  }>
  menuLabel?: string                         // 默认 '更多操作'
}): ColumnDef<T>
// 内部：自动 pinned right、size 由 inline 数量计算

customColumn<T>(opts: {
  key: string                                // id
  title: string | ((ctx: HeaderContext<T, unknown>) => ReactNode)
  cell: (row: T) => ReactNode
  size?: number
  enableSorting?: boolean
  accessorKey?: keyof T & string             // 可选；不传则纯 id 列
}): ColumnDef<T>
```

复杂场景仍可直接传原生 `ColumnDef<T>` 混用，工厂返回值即 `ColumnDef<T>`。

## 6. 调用侧示意（迁移后的 interviews）

```tsx
const grid = useDataGridState({
  namespace: 'studio-interviews',
  initialData,
  fetcher: fetchInterviews,
  defaultSorting: [{ id: 'createdAt', desc: true }],
  initialFilters: { status: 'all' },
})

const columns = useMemo(() => [
  selectColumn(),
  textColumn({ key: 'candidateName', title: '候选人', primary: true,
    secondary: r => r.candidateEmail || '未填写邮箱', size: 180 }),
  textColumn({ key: 'targetRole', title: '目标岗位', fallback: '待识别岗位' }),
  customColumn({ key: 'jobDescriptionName', title: '关联岗位', cell: ... }),
  customColumn({ key: 'resumeFileName', title: '简历文件', cell: ... }),
  customColumn({ key: 'status', title: '状态',
    cell: r => <InterviewStatusBadge status={r.status} /> }),
  customColumn({ key: 'currentRound', title: '当前轮次', cell: ... }),
  textColumn({ key: 'questionCount', title: '题目数',
    cell: r => `${r.questionCount} 题` }),
  textColumn({ key: 'creatorName', title: '创建人', fallback: '—' }),
  textColumn({ key: 'creatorOrganizationName', title: '创建人组织', fallback: '—' }),
  dateColumn({ key: 'createdAt', title: '创建时间', sortable: true }),
  actionsColumn({
    inline: [
      { icon: EyeIcon, label: '查看详情', onClick: r => setDetailRecordId(r.id) },
      { icon: PencilIcon, label: '编辑记录', onClick: r => setEditRecordId(r.id) },
    ],
    menu: [
      { icon: CopyIcon, label: '复制面试链接', onClick: r => copyInterviewLink(r) },
      { icon: Trash2Icon, label: '删除', variant: 'destructive',
        onClick: r => setDeleteRecord(r) },
    ],
  }),
], [])

return (
  <>
    <DataGrid
      {...grid.bind}
      columns={columns}
      getRowId={r => r.id}
      columnPinning={{ left: ['select', 'candidateName'], right: ['actions'] }}
      filters={[
        { type: 'search', key: 'search',
          placeholder: '搜索候选人、岗位、轮次或简历名', minWidth: '15rem' },
        { type: 'select', key: 'status', placeholder: '按状态筛选',
          options: [
            { value: 'all', label: '全部状态' },
            ...studioInterviewStatusValues.map(s => ({
              value: s, label: studioInterviewStatusMeta[s].label
            })),
          ]},
      ]}
      headerExtra={<StatsCards summary={summary} />}
      toolbarRight={<CreateInterviewDialog onCreated={grid.invalidate} />}
      bulkActions={({ selectedIds }) =>
        <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
          <Trash2Icon className="size-4" />批量删除 ({selectedIds.length})
        </Button>
      }
      empty={
        <Empty className="border-border/60">
          <EmptyHeader>...</EmptyHeader>
          <EmptyContent><CreateInterviewDialog onCreated={grid.invalidate} /></EmptyContent>
        </Empty>
      }
      dataTour={{
        table: 'studio-table',
        search: 'studio-search',
        filters: { status: 'studio-status-filter' },
        create: 'studio-create-btn',
        stats: 'studio-stats',
      }}
    />
    {/* dialogs 不变 */}
  </>
)
```

预期：interviews 从 630 → 约 220 行；其他 5 个页面降幅类似。

## 7. 迁移计划

按"一次性 6 个全迁"的要求，顺序：

1. **落地组件**：`DataGrid` + `useDataGridState` + 列工厂 + URL sync hook，类型完整、独立可测
2. **迁 `interviews`**（最重）：验证列固定、排序、行选择、批量、统计卡 slot、tutorial mock、URL sync
3. **迁 `interviewers / forms / interview-questions / job-descriptions`**（结构相似，逐个）
4. **迁 `departments`**（最简）
5. **校验**：`pnpm typecheck` + `pnpm lint`，每个页面在 dev 环境逐项过：搜索、筛选、分页、刷新、增删改、URL 刷新页面保留状态、列固定/选中/批量操作（仅 interviews）、tutorial 流程（仅 interviews）

## 8. 关键边界 / 风险

- **interviews tutorial mock**：当前 `displayRecords = isTutorialActive && records.length === 0 ? MOCK : records`，`displaySearch` 同理。迁移后这两段在调用侧组装好后传给 `data` / `filterValues.search` 即可，DataGrid 不感知 tutorial。
- **`data-tour` 锚点**：通过 `dataTour` prop 透传到对应内部元素。
- **列固定样式**：`getPinningStyles` 整合进 `parts/pinned-cell.tsx`，hover/selected 背景色规则原样保留。
- **URL sync 边界**：URL → state 仅在 mount 读一次；之后只 state → URL（避免后退按钮的双向同步循环）。SSR initial data 始终按默认参数 fetch；用户带参数直链时会有一瞬"默认结果 → URL 参数结果"的切换（已确认接受此权衡）。
- **search 写入 URL** 用 deferred 后的值，避免每个字符都 push 一次。
- **`page.tsx` 不变**：保持现有 SSR fetch 默认参数 + 注入 initialData。
- **依赖**：仅引入 `next/navigation` 的 `useRouter` / `useSearchParams`，不新增第三方包。

## 9. 不在本次范围

- 行虚拟化（`@tanstack/react-virtual`）
- 列显隐切换 / 列宽拖拽 / 列顺序拖拽
- 多列排序
- 服务端导出 / CSV
- 树形 / 展开行
- 编辑态单元格

以上能力如需要，未来在保持当前 API 不变的前提下增量加。
