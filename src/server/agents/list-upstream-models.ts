/**
 * 从 DashScope OpenAI 兼容端点获取当前 API key 可见的模型 id 列表，并做轻量缓存。
 * Lightweight cached fetcher for the model ids visible to the current API key
 * via the DashScope OpenAI-compatible endpoint.
 *
 * 失败策略：刷新失败但有过去成功缓存时返回旧数据（即"软"过期），保证短暂抖动不
 * 会让 UI 突然变空。从未成功过则返回 `null`，调用方据此判断上游不可达。
 *
 * Failure policy: when a refresh fails but we have a previous successful
 * snapshot, serve the stale copy ("soft" expiry) so a transient blip doesn't
 * empty the picker. Only return `null` when we have never succeeded.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  ids: Set<string>;
  fetchedAt: number;
}

let cached: CacheEntry | null = null;
let inflight: Promise<Set<string> | null> | null = null;

interface ListModelsResponse {
  data?: { id?: unknown }[];
}

async function doFetch(baseURL: string, apiKey: string): Promise<Set<string> | null> {
  const url = `${baseURL.replace(/\/$/, "")}/models`;
  try {
    const response = await fetch(url, {
      // 避免 Next.js 的隐式 fetch 缓存覆盖我们这里的 TTL 控制。
      // Disable Next.js fetch cache so our explicit TTL is the source of truth.
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      console.error(`[models] DashScope /models failed with ${response.status}`);
      return null;
    }
    const json = (await response.json()) as ListModelsResponse;
    const ids = new Set<string>();
    for (const entry of json.data ?? []) {
      if (entry && typeof entry.id === "string") {
        ids.add(entry.id);
      }
    }
    return ids;
  } catch (error) {
    console.error("[models] DashScope /models fetch threw", error);
    return null;
  }
}

export interface ListUpstreamModelIdsOptions {
  apiKey: string;
  baseURL: string;
  /** 跳过缓存，强制刷新。Skip cache and force refresh. */
  bypassCache?: boolean;
}

export function listUpstreamModelIds({
  apiKey,
  baseURL,
  bypassCache = false,
}: ListUpstreamModelIdsOptions): Promise<Set<string> | null> {
  const now = Date.now();
  if (!bypassCache && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.ids);
  }

  // 多请求并发时复用同一个 inflight，避免并发打爆 DashScope。
  // Coalesce concurrent callers onto a single inflight promise.
  if (inflight) {
    return inflight;
  }

  // 用 IIFE 而非 .then() 链，方便在缓存写入和清理 inflight 间保持顺序。
  // IIFE keeps the cache write + inflight clear ordered without a then chain.
  inflight = (async () => {
    try {
      const ids = await doFetch(baseURL, apiKey);
      if (ids) {
        cached = { fetchedAt: Date.now(), ids };
        return ids;
      }
      // 刷新失败：有过期缓存就用过期的，仍然没有则告诉调用方"上游不可达"。
      // Refresh failed: serve stale data if we have it; otherwise signal unreachable.
      return cached?.ids ?? null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
