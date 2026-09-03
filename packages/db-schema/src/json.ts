export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonObject | JsonPrimitive | (JsonValue | undefined)[];
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}
