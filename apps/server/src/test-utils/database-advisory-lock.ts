import postgres from "postgres";

export async function withDatabaseAdvisoryTestLock(
  name: string,
  run: () => Promise<void>,
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${name}))`;
      await run();
    });
  } finally {
    await client.end();
  }
}
