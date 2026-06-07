import "server-only";

import { revalidateTag } from "next/cache";
import type { CacheInvalidator } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";

export const nextCacheInvalidator: CacheInvalidator = {
  revalidateTag(tag) {
    // Next.js 16 的第二参是 cache profile；"default" keeps this independent
    // from the cacheLife profile used by the original cached entry.
    revalidateTag(tag, "default");
  },
};
