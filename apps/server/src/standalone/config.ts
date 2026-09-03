export interface StandaloneServerConfig {
  hostname: string;
  port: number;
}

const DEFAULT_HOSTNAME = "0.0.0.0";
const DEFAULT_PORT = 8787;

function parsePort(rawPort: string | undefined): number {
  if (!rawPort?.trim()) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT "${rawPort}"; expected an integer between 1 and 65535.`);
  }
  return port;
}

export function resolveStandaloneServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): StandaloneServerConfig {
  return {
    hostname: env.HOST?.trim() || DEFAULT_HOSTNAME,
    port: parsePort(env.PORT),
  };
}
