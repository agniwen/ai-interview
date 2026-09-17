# 远程 MCP：只读招聘数据

外部 Codex、Claude Code 通过 Streamable HTTP 连接 `/api/mcp`。首次登录在浏览器使用现有 Better Auth 登录方式，选择工作空间和读取范围并确认授权；随后客户端使用 OAuth 访问令牌，不需要保持网页打开。

## 实现与数据位置

- 协议：官方 `@modelcontextprotocol/server@2.0.0`，启用官方无状态旧协议兼容；没有自行实现 JSON-RPC 或 SSE。
- 授权：官方 `@better-auth/mcp@1.7.2`（内部组合 OAuth Provider）与 Better Auth JWT 插件。使用授权码、PKCE、动态客户端注册（DCR），不开放机器身份的 client credentials。
- OAuth/JWKS 表及工作空间授权表 `mcpGrant`：`packages/db-schema/src/schema.ts`。OAuth 表来自官方 `auth@1.7.2 generate`。
- 迁移：`apps/web/drizzle/20260917081641_remote_mcp_oauth/`。继续使用现有 Drizzle schema 和迁移目录。
- 公开介绍页：`/mcp`，无需登录或后台布局，提供当前站点的接入提示词，一键复制给 Agent 配置和验证连接。用户菜单中的“MCP 接入”指向该页。
- 登录授权页：`/mcp/authorize`；查看及撤销连接：`/mcp/connections`，可直接访问该地址管理授权。

授权绑定用户、客户端和一个工作空间，不依赖浏览器的当前工作空间。每次请求重新校验授权、成员资格、账号状态、客户端状态、功能权限和招聘数据可见范围。撤销授权立即使已有访问令牌失效，并撤销该授权的刷新令牌与同意记录。访问令牌有效期为 10 分钟；请求 `offline_access` 才能获得刷新令牌。

## 启用

1. 在需要启用的环境先运行现有迁移命令 `bun run db:migrate`。这会执行该数据库所有待应用的迁移，部署前应检查待迁移列表。
2. MCP 默认开启，无需设置 `MCP_ENABLED`。如需关闭，在承载 HTTP 服务的应用环境配置 `MCP_ENABLED=false`。Web 部署使用 Web 环境；独立 Server 部署使用 Server 环境。启动前需完成迁移；暂未迁移的环境应显式关闭。
3. `BETTER_AUTH_URL` 配置为客户端可访问的公开 HTTPS 源站地址。当前实现要求网页、`/api/auth`、`/api/mcp` 使用同一公开源站；独立 Server 可通过反向代理提供这些路径。
4. 重启服务。代理需要保留 Authorization 请求头，并转发 `/api/mcp`、`/api/auth/*`、`/.well-known/*`。授权网页也需可访问。

发现端点：

```text
https://your-app.example/.well-known/oauth-protected-resource/api/mcp
https://your-app.example/.well-known/oauth-authorization-server/api/auth
```

未携带令牌访问 MCP 会收到带 `WWW-Authenticate` 的 401，客户端通过上述元数据发现授权服务器。MCP 协议入口只接受 POST；GET/DELETE 返回 405，当前无状态实现不维持服务器会话。

## Codex

```sh
codex mcp add recruiting --url https://your-app.example/api/mcp --oauth-client-registration dcr
```

若尚未完成登录，或需要重新授权：

```sh
codex mcp login recruiting --oauth-client-registration dcr --scopes jobs:read,candidates:read,reports:read,offline_access
```

按客户端提示打开浏览器，登录并授权。关闭页面后，在 Codex 中请求“查询岗位”即可调用工具。部分旧版 CLI 没有注册策略选项，需使用支持远程 OAuth 的版本。

## Claude Code

```sh
claude mcp add --transport http recruiting https://your-app.example/api/mcp
```

进入 Claude Code，执行 `/mcp`，选择 `recruiting` 并认证。此版本服务提供 DCR；尚未启用基于 URL 的客户端元数据文档（CIMD）。自行实现客户端时，桌面/CLI 回调采用 loopback HTTP 地址，需要注册 `application_type: "native"`、`token_endpoint_auth_method: "none"`，并使用 PKCE S256。

## 工具和访问范围

| Scope             | 工具                                             | 数据范围                                                   |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `jobs:read`       | `search_jobs`、`get_job`                         | 授权工作空间中的岗位、规范 JD，不返回内部评价标准          |
| `candidates:read` | `search_candidates`、`get_candidate`             | 当前用户可见的招聘记录、简历资料、招聘人员评价             |
| `reports:read`    | `list_interview_reports`、`get_interview_report` | 可见候选人的 AI 报告，以及有真人面试读取权限时的已提交评价 |

`candidateId` 是 `search_candidates` 返回的招聘记录 ID。获取报告需要同时提供该 ID，防止通过报告 ID 绕过候选人可见性。报告列表返回 `reportId` 对应的 `id` 和 `kind`（`ai`/`human`）。列表默认每页 20 条，上限 50 条。第一版没有修改、删除或发起面试工具，也不返回原始录音、逐字稿或下载链接。

## 验证范围

自动化测试使用官方 Better Auth 内存适配器和官方 MCP 客户端，覆盖发现、DCR、签名授权、PKCE、工具发现/调用、授权码重放、拒绝授权、CSRF、跨工作空间访问、权限变化、移除成员、刷新和撤销，以及招聘可见性与 Web 元数据路由转发。

测试没有连接生产数据库。上线前需要在目标环境应用迁移，并分别在 Codex / Claude Code 完成一次实际登录与查询。

## 官方参考

- [Better Auth MCP](https://better-auth.com/docs/plugins/mcp)
- [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)

## 其他客户端示例

介绍页同时列出豆包工作、WorkBuddy、Cursor。以下文档说明它们具备远程 MCP 和浏览器授权能力；这些是协议能力的依据，尚未与本服务逐个完成实际联调。豆包工作特指提供自定义连接器的工作模式。

- [WorkBuddy 官方 MCP 指南](https://www.codebuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)：添加服务器 URL 并完成 OAuth 授权。
- [Cursor 官方 MCP 文档](https://cursor.com/docs/mcp)：支持 Streamable HTTP、OAuth 和动态客户端注册。
- [草料官方：在豆包工作中接入 MCP](https://cli.im/open-api/agent/open-platform-mcp/doubao-work.html)：展示自定义 HTTP 连接器、Agent 安装提示词和浏览器登录授权流程。
