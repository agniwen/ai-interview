interface OwnedResource {
  close: () => void;
  name: string;
}

export class RuntimeCloseStack {
  private closePromise: Promise<void> | null = null;
  private readonly resources: OwnedResource[] = [];

  add(name: string, close: OwnedResource["close"]): void {
    if (this.closePromise) {
      throw new Error(`Cannot add ${name} after runtime shutdown has started.`);
    }
    this.resources.push({ close, name });
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeOwnedResources();
    return this.closePromise;
  }

  private async closeOwnedResources(): Promise<void> {
    const errors: Error[] = [];
    for (const resource of this.resources.toReversed()) {
      try {
        await resource.close();
      } catch (error) {
        errors.push(
          error instanceof Error
            ? new Error(`Failed to close ${resource.name}.`, { cause: error })
            : new Error(`Failed to close ${resource.name}.`),
        );
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more runtime resources failed to close.");
    }
  }
}
