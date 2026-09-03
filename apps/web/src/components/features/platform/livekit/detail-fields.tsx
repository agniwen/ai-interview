import type { ReactNode } from "react";
import { z } from "zod";

const jsonStringSchema = z.string();

export function DetailFields({ fields }: { fields: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div className="min-w-0" key={field.label}>
          <dt className="text-muted-foreground text-xs">{field.label}</dt>
          <dd className="mt-1 break-words text-sm">
            {field.value === null || field.value === undefined || field.value === ""
              ? "—"
              : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  const result = jsonStringSchema.safeParse(value);
  const text = result.success ? result.data : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
      {text || "—"}
    </pre>
  );
}
