import { abortChatInstanceTransport, removeChatInstance } from "./chat-instance-manager";

/**
 * 路由卸载时的清理:
 *  - 中断 transport 上所有 fetch (包含 reconnect)
 *  - 释放 Chat 实例 (但不 stop —— 服务端 workflow 让它继续跑)
 *
 * Route teardown cleanup:
 *  - Abort the transport (cancels any local fetch including reconnect)
 *  - Release the Chat instance (but DO NOT stop it — the server-side workflow
 *    keeps running so generation isn't lost when the user navigates away)
 */
export function cleanupChatRouteOnUnmount(chatId: string): void {
  abortChatInstanceTransport(chatId);
  removeChatInstance(chatId);
}
