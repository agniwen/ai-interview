import { Injectable } from "@nestjs/common";

@Injectable()
export class RuntimeReadinessService {
  private draining = false;

  beginDrain(): void {
    this.draining = true;
  }

  isDraining(): boolean {
    return this.draining;
  }
}
