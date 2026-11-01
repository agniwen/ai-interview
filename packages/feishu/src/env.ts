function parseBooleanEnv(name: string, value: string): boolean {
  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no") {
    return false;
  }
  throw new Error(`${name} must be one of: 1, true, yes, 0, false, no.`);
}

export function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return parseBooleanEnv(name, value);
}
