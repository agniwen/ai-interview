/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes discovered through decorator metadata. */
import { Module } from "@nestjs/common";
import type { DynamicModule, FactoryProvider, ModuleMetadata, Provider } from "@nestjs/common";
import { BackendConfigModule } from "../config/backend-config.module.js";
import { BackendConfigService } from "../config/backend-config.service.js";
import { createBackgroundWorkloadAdapter } from "./background-workload.adapter.js";
import type { BackgroundWorkloadInfrastructurePorts } from "./compose-background-workload.ports.js";
import { composeBackgroundWorkloadPorts } from "./compose-background-workload.ports.js";
import { createHttpOnlyBackgroundWorkloadAdapter } from "./http-only-background-workload.adapter.js";

export const MIGRATED_BACKGROUND_WORKLOAD_ADAPTER = Symbol("MIGRATED_BACKGROUND_WORKLOAD_ADAPTER");

export interface BackgroundWorkloadInfrastructureAsyncOptions {
  imports?: ModuleMetadata["imports"];
  inject?: FactoryProvider["inject"];
  useFactory: FactoryProvider<
    BackgroundWorkloadInfrastructurePorts | Promise<BackgroundWorkloadInfrastructurePorts>
  >["useFactory"];
}

const HTTP_ONLY_PROVIDER: Provider = {
  inject: [BackendConfigService],
  provide: MIGRATED_BACKGROUND_WORKLOAD_ADAPTER,
  useFactory(config: BackendConfigService) {
    return createHttpOnlyBackgroundWorkloadAdapter(config.get("BACKGROUND_WORKERS_ENABLED"));
  },
};

@Module({
  exports: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER],
  imports: [BackendConfigModule],
  providers: [HTTP_ONLY_PROVIDER],
})
export class BackgroundWorkloadInfrastructureModule {
  /** Register the complete copied workload layer over real new-backend infrastructure. */
  static register(infrastructure: BackgroundWorkloadInfrastructurePorts): DynamicModule {
    return {
      exports: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER],
      module: BackgroundWorkloadInfrastructureModule,
      providers: [
        {
          provide: MIGRATED_BACKGROUND_WORKLOAD_ADAPTER,
          useValue: createBackgroundWorkloadAdapter(composeBackgroundWorkloadPorts(infrastructure)),
        },
      ],
    };
  }

  /** Compose real Nest-injected repositories/providers into the copied state machines. */
  static registerAsync(options: BackgroundWorkloadInfrastructureAsyncOptions): DynamicModule {
    return {
      exports: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER],
      imports: options.imports ?? [],
      module: BackgroundWorkloadInfrastructureModule,
      providers: [
        {
          inject: options.inject ?? [],
          provide: MIGRATED_BACKGROUND_WORKLOAD_ADAPTER,
          async useFactory(...dependencies: never[]) {
            const infrastructure = await options.useFactory(...dependencies);
            return createBackgroundWorkloadAdapter(composeBackgroundWorkloadPorts(infrastructure));
          },
        },
      ],
    };
  }
}
