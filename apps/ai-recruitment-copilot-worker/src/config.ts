export interface WorkerServerConfig {
  hostname: string;
  port: number;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveWorkerServerConfig(): WorkerServerConfig {
  return {
    hostname: process.env.WORKER_HOST || "0.0.0.0",
    port: parsePort(process.env.WORKER_PORT, 8790),
  };
}
