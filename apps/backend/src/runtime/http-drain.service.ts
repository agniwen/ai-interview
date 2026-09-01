import { Inject, Injectable } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { once } from "node:events";
import type { Server } from "node:http";
import { DRAIN_ORDER, DrainCoordinatorService } from "./drain-coordinator.service.js";

@Injectable()
export class HttpDrainService {
  constructor(
    @Inject(DrainCoordinatorService) drainCoordinator: DrainCoordinatorService,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {
    drainCoordinator.register({
      drain: () => this.stopAcceptingRequests(),
      name: "http-server",
      order: DRAIN_ORDER.http,
    });
  }

  private async stopAcceptingRequests(): Promise<void> {
    const server: Server | undefined = this.adapterHost.httpAdapter?.getHttpServer();
    if (!server?.listening) {
      return;
    }
    const closed = once(server, "close");
    server.close();
    server.closeIdleConnections();
    await closed;
  }
}
