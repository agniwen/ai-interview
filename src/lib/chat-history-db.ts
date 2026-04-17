import type { UIMessage } from "ai";
import { Dexie } from "dexie";
import type { EntityTable } from "dexie";

export interface StoredConversation {
  id: string;
  title: string;
  isTitleGenerating?: boolean;
  createdAt: number;
  updatedAt: number;
  jobDescription: string;
  messages: UIMessage[];
  /** Maps file part id (e.g. `${message.id}-file-${index}`) to imported studio interview record id. */
  resumeImports?: Record<string, string>;
}

class ChatHistoryDB extends Dexie {
  conversations!: EntityTable<StoredConversation, "id">;

  constructor() {
    super("chat-history-db");
    this.version(1).stores({
      conversations: "&id, updatedAt, createdAt",
    });
  }
}

export const chatHistoryDB = new ChatHistoryDB();
