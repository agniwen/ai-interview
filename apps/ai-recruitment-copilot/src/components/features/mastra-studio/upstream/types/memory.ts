export interface MemorySearchResult {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  threadId?: string;
  threadTitle?: string;
  context?: {
    before?: {
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }[];
    after?: {
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }[];
  };
}

export interface MemorySearchParams {
  lastMessages?: number | false;
  // Add other memory config overrides as needed
}
