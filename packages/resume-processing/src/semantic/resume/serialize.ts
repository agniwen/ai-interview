export function serializeDate(value: Date | string): string;
export function serializeDate(value: Date | string | null): string | null;
export function serializeDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
