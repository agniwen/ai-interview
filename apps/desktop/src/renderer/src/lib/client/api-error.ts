export class ApiError extends Error {
  readonly payload: unknown;
  readonly status: number;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      payload?: unknown;
      status?: number;
    },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiError";
    this.payload = options?.payload ?? null;
    this.status = options?.status ?? 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
