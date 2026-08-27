import type { AppType } from "./server/app";
import { hc } from "hono/client";

export type RpcClient = ReturnType<typeof hc<AppType>>;

export const hcWithType = (...args: Parameters<typeof hc>): RpcClient => hc<AppType>(...args);
