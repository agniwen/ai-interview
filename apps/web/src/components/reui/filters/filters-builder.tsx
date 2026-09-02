"use client";

import * as React from "react";
import {
  Cascader,
  CascaderEmpty,
  CascaderList,
  CascaderPanel,
  CascaderStatus,
} from "@/components/reui/cascader/cascader";
import { CascaderFooter } from "@/components/reui/cascader/cascader-footer";
import {
  CascaderBreadcrumb,
  CascaderInput,
  CascaderNav,
} from "@/components/reui/cascader/cascader-nav";
import type {
  CascaderActionItem,
  CascaderLabels,
  CascaderNode,
} from "@/components/reui/cascader/cascader-types";
import { CascaderVirtualItems } from "@/components/reui/cascader/cascader-virtual";
import {
  filterControlSizes,
  filterReadOnlyProps,
  useFilterActions,
  useFilterState,
} from "@/components/reui/filters/filters-context";
import {
  FILTER_FIELD_PICKER_CLASS,
  getFilterField,
  getFilterFieldCount,
  joinFilterPath,
  splitFilterPath,
} from "@/components/reui/filters/filters-lib";
import { getDefaultFilterOperator } from "@/components/reui/filters/filters-operators";
import type { FilterField } from "@/components/reui/filters/filters-types";

import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconFilterPlus } from "@tabler/icons-react";

/**
 * Projects ONLY the field tree: operators or values as nodes would force the
 * wizard through a combobox that owns the arrows and `aria-activedescendant`.
 */
function toCascaderNodes<V, O>(
  fields: readonly FilterField<V, O>[],
  parentPath: string[] = [],
): CascaderNode<FilterField<V, O>>[] {
  return fields.map((field) => {
    const path = [...parentPath, field.id];
    const node: CascaderNode<FilterField<V, O>> = {
      value: joinFilterPath(path),
      label: field.label,
      icon: field.icon,
      description: field.description,
      keywords: field.keywords,
      disabled: field.disabled,
      data: field,
    };
    if (field.fields?.length) {
      node.children = toCascaderNodes(field.fields, path);
      node.count = getFilterFieldCount(field);
    }
    return node;
  });
}

export interface FilterFieldPickerProps {
  /** The level being browsed. Not the chosen field. */
  path: string[];
  onPathChange: (path: string[]) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** A field was chosen, with its starting operator already resolved. */
  onSelect: (path: string[], defaultOperator: string | null) => void;
  /** Viewport height before the list scrolls. */
  maxHeight?: number;
  /** Cascader-only strings; the `FilterLabels` bridge below covers the rest. */
  labels?: Partial<CascaderLabels>;
  /** Pinned footer rows, OUT of the option ring so arrows never land on one. */
  actions?: CascaderActionItem[];
}

/**
 * Fully controlled, not draft-driven, so ONE picker serves both the create
 * popover (driven by the draft reducer) and an advanced row (its own state).
 */
export function FilterFieldPicker<V, O>({
  path,
  onPathChange,
  query,
  onQueryChange,
  onSelect,
  maxHeight = 260,
  labels: labelsProp,
  actions: actionItems,
}: FilterFieldPickerProps) {
  const actions = useFilterActions<V, O>();

  const items = React.useMemo(() => toCascaderNodes(actions.index.roots), [actions.index]);

  // Bridges `FilterLabels` onto the cascader's own key names. `labelsProp` is
  // spread LAST, so a consumer override always wins.
  const cascaderLabels = React.useMemo<Partial<CascaderLabels>>(
    () => ({
      search: actions.labels.searchFields,
      back: actions.labels.back,
      empty: actions.labels.empty,
      pathSeparator: actions.labels.pathSeparator.trim() || "/",
      itemCount: actions.labels.itemCount,
      branchAffordance: actions.labels.branchAffordance,
      rootLevel: actions.labels.fieldsLabel,
      panelLabel: actions.labels.fieldsLabel,
      resultsAnnouncement: actions.labels.resultsAnnouncement,
      actionsLabel: actions.labels.actionsLabel,
      ...labelsProp,
    }),
    [actions.labels, labelsProp],
  );

  return (
    <Cascader
      inline
      /* Pinned open: inline renders no popup and forces `open`, so the
         single-select commit's `setOpen(false)` dismisses nothing. That avoids
         the `multiple` plus `max` workaround and its `aria-multiselectable`. */
      open
      onOpenChange={() => {}}
      items={items}
      /* No `selectable` predicate: LEAVES commit, branches navigate. Honouring
         a branch's opt-in made one click mean both drill and commit. */
      searchScope="deep"
      /* Nothing is ever selected, so the ~24px check gutter is dead space. */
      indicator={false}
      path={path}
      onPathChange={onPathChange}
      /* Controlled: the single-select arm of `commit()` never clears the query,
         so an uncontrolled one would bleed into the next step. */
      inputValue={query}
      onInputValueChange={onQueryChange}
      value=""
      onValueChange={(value) => {
        const nextPath = splitFilterPath(value);
        const field = getFilterField(actions.index, nextPath);
        if (!field) return;
        onSelect(nextPath, getDefaultFilterOperator(field, actions.resolveOperators(field)));
      }}
      labels={cascaderLabels}
      actions={actionItems}
      /* Set here only: `CascaderList` takes its own `maxHeight` and that WINS,
         so a second copy on the list is a divergence waiting to happen. */
      maxHeight={maxHeight}
    >
      <CascaderPanel>
        <CascaderNav>
          <CascaderInput placeholder={actions.labels.searchFields} />
        </CascaderNav>
        <CascaderBreadcrumb />
        <CascaderEmpty />
        <CascaderList>
          {/* WINDOWED: the picker is where scale lives and nothing here pins.
            Below the threshold it renders what `CascaderItems` does. */}
          <CascaderVirtualItems />
        </CascaderList>
        <CascaderFooter />
        <CascaderStatus />
      </CascaderPanel>
    </Cascader>
  );
}

function FieldStep<V, O>() {
  const actions = useFilterActions<V, O>();
  const { draft } = useFilterState<V>();

  return (
    <FilterFieldPicker<V, O>
      path={draft?.cascaderPath ?? []}
      onPathChange={(next) => actions.dispatchDraft({ type: "setCascaderPath", path: next })}
      query={draft?.query ?? ""}
      onQueryChange={(query) => actions.dispatchDraft({ type: "setQuery", query })}
      onSelect={(path, defaultOperator) =>
        actions.dispatchDraft({ type: "selectField", path, defaultOperator })
      }
    />
  );
}

export interface FiltersBuilderProps {
  /** Replaces the default Add filter button. */
  trigger?: React.ReactNode;
  className?: string;
}

/**
 * The Add filter popover. ONE panel, the field step: picking a field commits
 * the rule with its default operator and focuses its value. `open` derives from the
 * draft and `openCreate` is gated, so read-only and disabled shut every route.
 */
export function FiltersBuilder<V, O>({ trigger, className }: FiltersBuilderProps) {
  const actions = useFilterActions<V, O>();
  const sizes = filterControlSizes(actions);
  const { draft } = useFilterState<V>();
  const open = draft !== null && draft.ruleId === null;
  // The HANDOFF close, the one that must not FADE: the panel is a 224px card
  // dissolving over the very menu the user is now meant to read.
  const committing = draft !== null && draft.ruleId === null && draft.status === "ready";
  // LATCHED, because `committing` is true for one render only, before the exit
  // it suppresses begins. Adjusted during render; an effect is one frame late.
  const [instantExit, setInstantExit] = React.useState(false);
  if (committing && !instantExit) setInstantExit(true);
  else if (open && !committing && instantExit) setInstantExit(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) actions.closeDraft();
        else actions.openCreate();
      }}
    >
      <PopoverTrigger
        /* On the TRIGGER so a consumer's own `trigger` wears the state too. */
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button
              variant="outline"
              size={sizes.button}
              className="transition-[color,background-color,border-color,box-shadow]"
            >
              {/* No filter-plus glyph in phosphor or remixicon. */}
              <IconFilterPlus data-icon="inline-start" />
              {actions.labels.addFilter}
            </Button>
          )
        }
      />
      {/* The default, then the root override, then this `className` last, so
        the specific wins. */}
      <PopoverContent
        align="start"
        // Keep the focus handed to the new value instead of restoring the trigger.
        finalFocus={instantExit ? false : undefined}
        className={cn(
          FILTER_FIELD_PICKER_CLASS,
          /* See `instantExit`. Both PROPERTIES (an `exit` animation AND a
             transition each paint over the successor) and both twins (Base UI
             `data-ending-style`, Radix `data-[state=closed]`); only one can
             match in a given build. The string stays identical on both sides
             because listing only the Base UI half left the radix twin fading
             a 224px card over its successor. */
          instantExit &&
            cn(
              "data-ending-style:animate-none data-ending-style:transition-none",
              "data-[state=closed]:animate-none data-[state=closed]:transition-none",
            ),
          actions.fieldPickerClassName,
          className,
        )}
      >
        <FieldStep<V, O> />
      </PopoverContent>
    </Popover>
  );
}

/** Exported for custom field pickers. */
export { toCascaderNodes };
