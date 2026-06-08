import postgres from "postgres";

type PostgresClient = ReturnType<typeof postgres>;

let client: PostgresClient | null = null;

function getPoolMax(): number {
  const raw = process.env.POSTGRES_POOL_MAX;
  if (!raw) {
    return 2;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

function getClient(): PostgresClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  client ??= postgres(process.env.DATABASE_URL, {
    max: getPoolMax(),
  });
  return client;
}

export async function pingDatabase(): Promise<void> {
  await getClient()`select 1`;
}

export async function closeDatabase(): Promise<void> {
  await client?.end();
  client = null;
}
