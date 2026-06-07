import { handle } from "hono/vercel";

import { createServerApp } from "@arc/backend/server/app";
import { configureCacheInvalidator } from "@arc/backend/server/cache-tags";
import { nextCacheInvalidator } from "./next-cache-invalidator";

export const maxDuration = 300;

configureCacheInvalidator(nextCacheInvalidator);
const app = createServerApp();

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
