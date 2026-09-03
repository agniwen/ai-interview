import { z } from "zod";

export const APP_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const APP_VERSION_REQUEST_TIMEOUT_MS = 5000;

const appVersionResponseSchema = z.object({ buildTime: z.string() });

export function isStaleClient(latestBuildTime: string, loadedBuildTime: string) {
  return latestBuildTime !== loadedBuildTime;
}

export async function fetchLatestBuildTime(
  fetcher: typeof fetch = fetch,
  timeoutMs = APP_VERSION_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher("/api/app-version", {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Version check failed with status ${response.status}`);
    }

    const body = appVersionResponseSchema.safeParse(await response.json());
    if (!body.success) {
      throw new Error("Version check returned an invalid response");
    }

    return body.data.buildTime;
  } finally {
    window.clearTimeout(timeout);
  }
}
