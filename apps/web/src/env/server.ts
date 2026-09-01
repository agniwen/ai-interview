import { createServerEnv, SERVER_ENV_NAMES } from "@app/server/env";
import type { ServerEnvName } from "@app/server/env";

export { createServerEnv, SERVER_ENV_NAMES };
export type { ServerEnvName };

export function applyServerEnv(
  target: Record<string, string | undefined> = process.env,
  source = createServerEnv(process.env),
) {
  for (const key of SERVER_ENV_NAMES) {
    const value = source[key];
    if (value === undefined) {
      Reflect.deleteProperty(target, key);
    } else {
      target[key] = value;
    }
  }
}
