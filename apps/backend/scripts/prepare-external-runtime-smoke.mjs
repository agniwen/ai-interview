import { CreateBucketCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the external runtime smoke.`);
  }
  return value;
}

const migrationsDirectory = fileURLToPath(new URL("../../web/drizzle", import.meta.url));
const database = postgres(required("DATABASE_URL"), { max: 1, onnotice: (notice) => notice });
try {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  let applied = 0;
  for (const directory of directories) {
    let migration;
    try {
      migration = await readFile(`${migrationsDirectory}/${directory}/migration.sql`, "utf-8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    await database.begin(async (transaction) => {
      await transaction.unsafe(migration);
    });
    applied += 1;
  }
  process.stdout.write(`✓ Applied ${applied} migrations to the isolated database\n`);
} finally {
  await database.end();
}

const storage = new S3Client({
  credentials: {
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  },
  endpoint: required("S3_ENDPOINT"),
  forcePathStyle: true,
  region: required("S3_REGION"),
});
try {
  try {
    await storage.send(new CreateBucketCommand({ Bucket: required("S3_BUCKET_NAME") }));
    process.stdout.write("✓ Created the isolated S3-compatible bucket\n");
  } catch (error) {
    if (
      !(error instanceof S3ServiceException) ||
      !["BucketAlreadyExists", "BucketAlreadyOwnedByYou"].includes(error.name)
    ) {
      throw error;
    }
    process.stdout.write("✓ Reused the isolated S3-compatible bucket\n");
  }
} finally {
  storage.destroy();
}
