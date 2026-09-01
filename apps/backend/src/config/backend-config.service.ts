import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { BackendEnvironment } from "./backend-environment.schema.js";

@Injectable()
export class BackendConfigService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<BackendEnvironment, true>,
  ) {}

  get<K extends keyof BackendEnvironment>(name: K): BackendEnvironment[K] {
    return this.config.get(name, { infer: true });
  }
}
