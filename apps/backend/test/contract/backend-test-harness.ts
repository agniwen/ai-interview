import type { INestApplication } from "@nestjs/common";
import supertest from "supertest";

interface BackendApplicationOptions {
  backgroundWorkersEnabled?: boolean;
  logger?: false;
  readinessDatabaseCheck?: boolean;
}

export interface BackendTestHarness {
  app: INestApplication;
  close: () => Promise<void>;
  http: ReturnType<typeof supertest>;
}

const TEST_ENVIRONMENT = {
  BACKGROUND_WORKERS_ENABLED: "false",
  BETTER_AUTH_SECRET: "contract-test-secret-contract-test-secret",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgres://backend:backend@127.0.0.1:5432/backend_contract",
  NODE_ENV: "test",
  REDIS_URL: "redis://127.0.0.1:6379/15",
} as const;

export async function createBackendTestHarness(
  options: BackendApplicationOptions = {},
): Promise<BackendTestHarness> {
  const previousEnvironment = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(TEST_ENVIRONMENT)) {
    previousEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }

  let app: INestApplication;
  try {
    const { createBackendApplication } = await import("../../src/bootstrap.js");
    app = await createBackendApplication({
      backgroundWorkersEnabled: false,
      logger: false,
      readinessDatabaseCheck: false,
      ...options,
    });
  } catch (error) {
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
      } else {
        process.env[name] = value;
      }
    }
    throw error;
  }

  return {
    app,
    async close() {
      await app.close();
      for (const [name, value] of previousEnvironment) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, name);
        } else {
          process.env[name] = value;
        }
      }
    },
    http: supertest(app.getHttpServer()),
  };
}
