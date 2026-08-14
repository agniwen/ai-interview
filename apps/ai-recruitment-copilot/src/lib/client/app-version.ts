export const APP_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const APP_VERSION_REQUEST_TIMEOUT_MS = 5000;

interface AppVersionResponse {
  buildTime: string;
}

function isAppVersionResponse(value: unknown): value is AppVersionResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof (value as Record<string, unknown>).buildTime === "string";
}

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

    const body: unknown = await response.json();
    if (!isAppVersionResponse(body)) {
      throw new Error("Version check returned an invalid response");
    }

    return body.buildTime;
  } finally {
    window.clearTimeout(timeout);
  }
}
