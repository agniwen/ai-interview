import { z } from "zod";
import { useAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { useSyncExternalStore } from "react";

type FilterSelection = Record<string, string[]>;
const storage = createJSONStorage<FilterSelection>(() => globalThis.window?.localStorage);

// Field names only. Values, operators, query ids and candidate data never enter storage.
export const listFilterSelectionAtom = atomWithStorage<FilterSelection>(
  "arc:list-filter-selection:v1",
  {},
  storage,
  { getOnInit: true },
);
const selectionSchema = z.record(z.string(), z.array(z.string()));
const subscribe = () => () => {
  /* empty */
};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useFilterSelection(scope: string, available: string[]) {
  const [selections, setSelections] = useAtom(listFilterSelectionAtom);
  // getOnInit reads synchronously on the client; defer its visual result until hydration.
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const parsed = selectionSchema.safeParse(selections);
  const stored = hydrated && parsed.success ? (parsed.data[scope] ?? []) : [];
  const selected = [...new Set(stored.filter((key) => available.includes(key)))];
  return [
    selected,
    (keys: string[]) =>
      setSelections((previous) => ({
        ...selectionSchema.safeParse(previous).data,
        [scope]: keys,
      })),
  ] as const;
}
