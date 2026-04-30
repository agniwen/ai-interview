import type { UIMessage } from "ai";
import { Chat } from "@ai-sdk/react";
import { AbortableWorkflowChatTransport } from "./chat-transport";

type ChatInstanceInit = ConstructorParameters<typeof Chat<UIMessage>>[0];

interface ManagedChatInstance {
  instance: Chat<UIMessage>;
  transport: ChatInstanceInit["transport"];
}

/**
 * 与每个聊天路由生命周期挂钩的 Chat 实例缓存:
 *  - Map 而不是 LRU: 不会因为别的会话被打开就把当前 in-flight 流的 Chat 实例驱逐掉。
 *  - 路由 unmount 时通过 `cleanupChatRouteOnUnmount` 释放(只 abort 本地 fetch,
 *    服务端 workflow 仍然在后台跑)。
 *
 * Chat instances scoped to chat-route lifetime:
 *  - Backed by a Map (not LRU) so opening a different conversation never evicts
 *    a Chat instance that still has an in-flight stream.
 *  - Released on route unmount via `cleanupChatRouteOnUnmount`, which only
 *    aborts the local fetch — the server-side workflow keeps running.
 */
const chatInstances = new Map<string, ManagedChatInstance>();

function isAbortableTransport(value: unknown): value is AbortableWorkflowChatTransport {
  return value instanceof AbortableWorkflowChatTransport;
}

export function getOrCreateChatInstance(
  chatId: string,
  init: ChatInstanceInit,
): { instance: Chat<UIMessage>; alreadyExisted: boolean } {
  const existing = chatInstances.get(chatId);
  if (existing) {
    return { alreadyExisted: true, instance: existing.instance };
  }

  const instance = new Chat<UIMessage>(init);
  chatInstances.set(chatId, { instance, transport: init.transport });
  return { alreadyExisted: false, instance };
}

export function hasChatInstance(chatId: string): boolean {
  return chatInstances.has(chatId);
}

export function abortChatInstanceTransport(chatId: string): void {
  const managed = chatInstances.get(chatId);
  if (!managed || !isAbortableTransport(managed.transport)) {
    return;
  }
  managed.transport.abort();
}

export function removeChatInstance(chatId: string): void {
  chatInstances.delete(chatId);
}
