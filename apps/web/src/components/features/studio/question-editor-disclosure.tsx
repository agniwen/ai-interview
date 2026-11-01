import { useStore } from "@tanstack/react-form";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export function QuestionEditorDisclosure({
  form,
  fieldPrefix,
  enabled,
  initiallyOpen,
  children,
}: {
  // oxlint-disable-next-line no-explicit-any -- The owning editor retains the concrete TanStack Form type.
  form: any;
  fieldPrefix: string;
  enabled: boolean;
  initiallyOpen: boolean;
  children: (state: { expanded: boolean; toggle: () => void; panelId: string }) => ReactNode;
}) {
  const hasErrors = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any -- The form store retains its concrete type in the owning editor.
    (state: any) => {
      const fields: Record<string, { errors?: unknown[] }> = state.fieldMeta;
      return Object.entries(fields).some(
        ([path, meta]) => path.startsWith(fieldPrefix) && Boolean(meta.errors?.length),
      );
    },
  );
  const [open, setOpen] = useState(initiallyOpen);
  const panelId = useId();
  return children({
    expanded: !enabled || open || hasErrors,
    panelId,
    toggle: () => setOpen((value) => !value),
  });
}
