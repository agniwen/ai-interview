import { env } from "@/env/client";
import { client } from "@/lib/client/generated/backend/client.gen";

client.setConfig({
  baseUrl: env.NEXT_PUBLIC_BETTER_AUTH_URL,
  credentials: "include",
});

export function backendApiUrl(path: string): string {
  const baseUrl = env.NEXT_PUBLIC_BETTER_AUTH_URL.endsWith("/")
    ? env.NEXT_PUBLIC_BETTER_AUTH_URL
    : `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/`;
  return new URL(path.replace(/^\/+/, ""), baseUrl).toString();
}

export * from "@/lib/client/generated/backend/sdk.gen";
export * from "@/lib/client/generated/backend/types.gen";
