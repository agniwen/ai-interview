export interface ChatMeta {
  jobDescription: string;
  enableThinking: boolean;
  /**
   * 用户在 composer 选中的模型 id；空串表示沿用服务端默认。
   * Model id picked in the composer; empty string defers to the server default.
   */
  model: string;
}

const DEFAULT_META: ChatMeta = {
  enableThinking: false,
  jobDescription: "",
  model: "",
};

const metas = new Map<string, ChatMeta>();

export function getChatMeta(chatId: string): ChatMeta {
  return metas.get(chatId) ?? DEFAULT_META;
}

export function setChatMeta(chatId: string, meta: ChatMeta): void {
  metas.set(chatId, meta);
}

export function clearChatMeta(chatId: string): void {
  metas.delete(chatId);
}
