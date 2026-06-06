import { handle } from "hono/vercel";

import { nextCacheInvalidator } from "@/server/adapters/next/cache-invalidator";
import { createServerApp } from "@/server/app";
import { configureCacheInvalidator } from "@/server/cache-tags";

export const maxDuration = 300;

configureCacheInvalidator(nextCacheInvalidator);
const app = createServerApp();

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
