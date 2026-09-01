import type postgres from "postgres";

export class DatabaseConnection {
  constructor(readonly client: ReturnType<typeof postgres>) {}

  async close(): Promise<void> {
    await this.client.end();
  }

  async ping(): Promise<void> {
    await this.client`select 1`;
  }
}
