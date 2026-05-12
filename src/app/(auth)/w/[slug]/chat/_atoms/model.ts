import { atomWithStorage, createJSONStorage } from "jotai/utils";

const localStore = createJSONStorage<Record<string, string>>(() =>
  typeof localStorage === "undefined" ? (undefined as unknown as Storage) : localStorage,
);

/**
 * 还没创建 conversation 时的"草稿"槽位 key（空串）。
 * Draft slot key (empty string) for the pre-conversation state.
 */
export const DRAFT_CHAT_KEY = "";

/**
 * 按 chatId 索引的会话模型选择，持久化到 localStorage。
 * 空字符串 key（DRAFT_CHAT_KEY）作为"还没建会话时"的草稿，首次发消息后会
 * 被 chat-workspace 复制到新建的 chatId 下并清空。
 *
 * Per-conversation model selection, persisted to localStorage. The empty-string
 * key (DRAFT_CHAT_KEY) is the pre-conversation draft slot — chat-workspace
 * copies it to the freshly created chatId on first send and clears it.
 */
export const chatModelByIdAtom = atomWithStorage<Record<string, string>>(
  "chat-model-by-id-v1",
  {},
  localStore,
  { getOnInit: true },
);

/**
 * 当 session 持有的 model id 不在最新 /models 列表里时，picker 会自动切到这个 id。
 * 服务端 `defaultId` 的二级兜底也用这个值。
 *
 * Fallback id auto-applied when a session's chosen model disappears from the
 * latest /models response. Also used as the secondary fallback for the
 * server-side `defaultId`.
 */
export const SESSION_MODEL_FALLBACK_ID = "qwen-plus-latest";
