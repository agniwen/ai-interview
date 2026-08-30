import type { AppType } from "./server/app";
import type { chatRouter } from "./server/routes/chat/route";
import type { publicRouter } from "./server/routes/public/route";
import type { studioInterviewsRouter } from "./server/routes/studio/routes/interviews/route";
import { hc } from "hono/client";

export type RpcClient = ReturnType<typeof hc<AppType>>;
export type ChatRpcClient = ReturnType<typeof hc<typeof chatRouter>>;
export type PublicRpcClient = ReturnType<typeof hc<typeof publicRouter>>;
export type StudioInterviewsRpcClient = ReturnType<typeof hc<typeof studioInterviewsRouter>>;

export const hcWithType = (...args: Parameters<typeof hc>): RpcClient => hc<AppType>(...args);
export const hcChatWithType = (...args: Parameters<typeof hc>): ChatRpcClient =>
  hc<typeof chatRouter>(...args);
export const hcPublicWithType = (...args: Parameters<typeof hc>): PublicRpcClient =>
  hc<typeof publicRouter>(...args);
export const hcStudioInterviewsWithType = (
  ...args: Parameters<typeof hc>
): StudioInterviewsRpcClient => hc<typeof studioInterviewsRouter>(...args);
