# @app/recruiting-mcp-apps

招聘 MCP 服务的 [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) 视图：在 ChatGPT、Claude 等支持 MCP Apps 的客户端里，把候选人搜索结果和候选人详情渲染成卡片。

## 职责与边界

- 视图运行在宿主的沙箱 iframe 中，通过 `@modelcontextprotocol/ext-apps` 与宿主通信：接收工具结果、调用 `get_candidate` 下钻详情、通过宿主打开工作台链接。
- 卡片数据契约在 `@app/shared/recruiting-mcp-cards`，服务端工具的 `structuredContent` 与本视图共用同一份 schema；文案标签由服务端解析好再下发。
- 样式优先使用宿主下发的标准变量（`--color-*`、`--font-sans` 等），未下发时回退到产品自己的设计变量，并跟随宿主的浅色 / 深色主题。
- 本包只产出静态 HTML，不读取环境变量，也不访问数据库或网络；资源注册、鉴权和数据读取都在 `apps/server/src/routes/mcp/`。

## 构建与导出

`bun run build` 先用 Vite 构建，再由 `scripts/emit-html-module.ts` 把脚本和样式内联成单个 HTML（宿主不允许加载外部资源），生成：

- `dist/index.js` / `dist/index.d.ts`：导出 `recruitingCardsHtml`，供服务端作为 `ui://recruiting/cards.html` 资源返回；
- `dist/recruiting-cards.html`：同一份 HTML，便于本地查看。

`dist/` 不入库。Turbo 的 `^build` 会在 typecheck / test / build 前自动构建；直接运行的入口通过 pre 脚本构建：Web 的 `predev`、`prebuild`、`pretypecheck`，Server 的 `prestart`、`predev:standalone`、`pretypecheck`。

## 新增卡片

1. 在 `@app/shared/recruiting-mcp-cards` 的 `recruitingMcpCardSchema` 联合类型里加一个 `kind`；
2. 服务端在对应工具里用 `registerAppTool` 声明 `_meta.ui.resourceUri` 与 `outputSchema`，返回 `structuredContent`；
3. 在 `src/recruiting-cards-view.tsx` 按 `kind` 分发到新组件，并补充 `src/tests/` 下的展示测试。
