import { createClientEnv, withClientDevelopmentDefaults } from "./client.schema";

const runtimeEnv = withClientDevelopmentDefaults(import.meta.env, import.meta.env.DEV);

export const env = createClientEnv(runtimeEnv);
export { createClientEnv } from "./client.schema";
