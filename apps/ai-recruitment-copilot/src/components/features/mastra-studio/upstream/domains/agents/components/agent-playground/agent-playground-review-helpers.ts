export function truncateInput(value: unknown, max: number): string {
  if (typeof value === "string") {
    return value.length > max ? `${value.slice(0, max)}...` : value;
  }
  try {
    const str = JSON.stringify(value);
    return str.length > max ? `${str.slice(0, max)}...` : str;
  } catch {
    return String(value);
  }
}

export function stringifyValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getDatasetTags(dataset: unknown): string[] {
  if (typeof dataset !== "object" || dataset === null || !("tags" in dataset)) {
    return [];
  }
  return Array.isArray(dataset.tags)
    ? dataset.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
}
