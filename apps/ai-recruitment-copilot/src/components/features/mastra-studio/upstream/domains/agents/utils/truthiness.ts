export function isTruthy(value: unknown): boolean {
  if (typeof value === "number") {
    return value !== 0 && Number.isNaN(value) === false;
  }
  return value !== false && value !== "" && value !== 0n && value !== null && value !== undefined;
}

export function allTruthy(...values: unknown[]): boolean {
  return values.every(isTruthy);
}

export function anyTruthy(...values: unknown[]): boolean {
  return values.some(isTruthy);
}
