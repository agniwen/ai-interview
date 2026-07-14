export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function firstDefined<T>(...values: (T | null | undefined)[]): T | undefined {
  return values.find(isDefined);
}

export function withDefault<T>(value: T | null | undefined, fallback: T): T {
  if (isDefined(value)) {
    return value;
  }
  return fallback;
}
