import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/client/clipboard";

function installationPrompt(endpoint: string) {
  return `请帮我在当前使用的 Agent 客户端中接入「招聘工作台」远程 MCP，并实际完成配置。

服务地址：${endpoint}
传输方式：Streamable HTTP
认证方式：OAuth（授权码 + PKCE，支持动态客户端注册 DCR）
只读范围：jobs:read、candidates:read、reports:read；如需持续连接，请同时请求 offline_access。

请按以下步骤执行：
1. 识别当前客户端（例如 Codex、Cursor、Claude Code、WorkBuddy 或豆包工作），查看其已安装版本、MCP 配置和官方配置方法。复用相同地址的已有配置，保留其他 MCP 服务；使用 recruiting 作为名称，若已被其他地址占用则使用新名称。
2. 使用客户端原生的远程 HTTP MCP 支持添加上述服务。Codex 可使用 codex mcp add <名称> --url <服务地址>；Claude Code 可使用 claude mcp add --transport http <名称> <服务地址>。命令行客户端先检查当前版本的 --help；支持注册策略选项时选择 dcr。Cursor 使用其 MCP 配置文件；WorkBuddy、豆包工作使用自定义连接器或 MCP 设置，选择远程 HTTP 并填入服务地址，按该客户端当前版本的配置格式操作，不套用其他客户端的命令。若当前环境无法修改客户端配置，请说明具体原因并给出准确步骤，不要声称已安装。
3. 发起 OAuth 登录。Codex 使用 codex mcp login <名称>（支持时指定 --oauth-client-registration dcr 和 --scopes jobs:read,candidates:read,reports:read,offline_access）；Claude Code 引导我在 /mcp 中选择该服务并认证；Cursor、WorkBuddy、豆包工作引导我在对应连接器或 MCP 设置中完成授权。把需要我打开的授权地址或操作步骤告诉我，等待我在浏览器登录、选择工作空间和访问范围并确认授权。不要索取或复制我的密码、Cookie、访问令牌或刷新令牌。
4. 授权完成后，验证连接并列出可用工具；调用 search_jobs 查询第 1 页、每页 1 条，确认能正常访问。若客户端需要重启或开启新会话，请明确告知。仅报告已实际完成的验证。

这是只读服务，可查询岗位与 JD、候选人及简历资料、AI 面试报告和有权查看的已提交真人面试评价。只能访问我所授权工作空间中当前有权查看的数据。若服务返回未启用或无法连接，报告具体问题，不要改动服务端环境或数据库。`;
}

export function McpIntroPage() {
  const [endpoint] = useState(() => new URL("/api/mcp", window.location.origin).href);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "manual" | "failed">(
    "idle",
  );
  const prompt = installationPrompt(endpoint);
  let copyMessage = "粘贴到 Agent 对话中即可。";
  if (copyState === "manual") {
    copyMessage = "请在弹出的窗口中手动复制提示词。";
  } else if (copyState === "failed") {
    copyMessage = "复制失败，请重试。";
  }
  async function copyPrompt() {
    setCopyState("copying");
    setCopyState(await copyTextToClipboard(prompt));
  }
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-background px-6 py-20 text-foreground"
    >
      <div className="flex w-full max-w-lg flex-col items-start gap-6">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          让 Agent 连接招聘工作台
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          在 Codex、Cursor、Claude Code、WorkBuddy、豆包工作等客户端中查询岗位、候选人和面试报告。
          复制提示词发给 Agent，即可开始配置与授权。
        </p>
        <Button onClick={copyPrompt} disabled={copyState === "copying"}>
          {copyState === "copied" ? (
            <IconCheck data-icon="inline-start" />
          ) : (
            <IconCopy data-icon="inline-start" />
          )}
          {copyState === "copied" ? "已复制提示词" : "复制提示词"}
        </Button>
        <output
          aria-live="polite"
          className="text-sm text-muted-foreground"
          style={{
            visibility: copyState === "idle" || copyState === "copying" ? "hidden" : "visible",
          }}
        >
          {copyMessage}
        </output>
      </div>
    </main>
  );
}
