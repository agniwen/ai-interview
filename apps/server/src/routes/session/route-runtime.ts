import { defaultSessionStateDependencies } from "./application/default-session-state";
import { createSessionRouter } from "./route";

export const sessionRouter = createSessionRouter(defaultSessionStateDependencies);
