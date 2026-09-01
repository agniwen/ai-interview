import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { HttpDrainService } from "./http-drain.service.js";

describe("HttpDrainService", () => {
  it("stops accepting requests and waits for the HTTP server to close", async () => {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const coordinator = { register: vi.fn() };
    // SAFETY: the adapter host fake exposes the same getHttpServer boundary used by the service.
    const service = new HttpDrainService(
      coordinator as never,
      {
        httpAdapter: { getHttpServer: () => server },
      } as never,
    );

    expect(service).toBeInstanceOf(HttpDrainService);
    expect(coordinator.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: "http-server", order: 50 }),
    );
    const participant = coordinator.register.mock.calls[0]?.[0];
    await participant?.drain();
    expect(server.listening).toBe(false);
  });
});
