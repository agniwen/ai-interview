const LOOPBACK_IPV4_PATTERN = /^127(?:\.\d{1,3}){3}$/;

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "::1" ||
    LOOPBACK_IPV4_PATTERN.test(normalizedHostname)
  );
}

function publicAppBaseUrl(): string | undefined {
  const candidates = [process.env.NEXT_PUBLIC_BASE_URL, process.env.BETTER_AUTH_URL];
  for (const candidate of candidates) {
    const configuredBaseUrl = candidate?.trim();
    if (!configuredBaseUrl) {
      continue;
    }

    try {
      const parsedUrl = new URL(configuredBaseUrl);
      if (
        ["http:", "https:"].includes(parsedUrl.protocol) &&
        !isLoopbackHostname(parsedUrl.hostname)
      ) {
        return configuredBaseUrl.replace(/\/+$/, "");
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export function absolutePublicAppUrl(path: string): string | undefined {
  const baseUrl = publicAppBaseUrl();
  if (!baseUrl) {
    return undefined;
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function requireAbsolutePublicAppUrl(path: string): string {
  const url = absolutePublicAppUrl(path);
  if (!url) {
    throw new Error("应用公网访问地址未配置或指向本机，无法生成外部面试链接。");
  }
  return url;
}
