"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import type { PlatformWorkspaceOption } from "./user-form";

const SEARCH_DEBOUNCE_MS = 250;

function toSelectOption(workspace: PlatformWorkspaceOption): SearchableSelectOption {
  return { description: `/w/${workspace.slug}`, label: workspace.name, value: workspace.id };
}

export function InitialWorkspacePicker({
  id,
  invalid,
  onChange,
  searchWorkspaces,
  value,
}: {
  id: string;
  invalid?: boolean;
  onChange: (workspace: PlatformWorkspaceOption | null) => void;
  /** 空关键词返回默认的前 10 个工作区。An empty query returns the default first 10. */
  searchWorkspaces: (query: string) => Promise<PlatformWorkspaceOption[]>;
  value: PlatformWorkspaceOption | null;
}) {
  // 首次打开下拉后才请求，避免创建弹窗一打开就查询。Fetch only after the list is first opened.
  const [activated, setActivated] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const workspaces = useQuery({
    enabled: activated,
    queryFn: () => searchWorkspaces(debouncedQuery),
    queryKey: ["platform-user-initial-workspaces", debouncedQuery],
    staleTime: 30_000,
  });

  const results = workspaces.data ?? [];
  // 已选工作区不在当前搜索结果里时仍要能显示其名称。Keep the selection labelled across searches.
  const options = [
    ...(value && !results.some((workspace) => workspace.id === value.id) ? [value] : []),
    ...results,
  ];

  return (
    <SearchableSelect
      emptyMessage={workspaces.isError ? "加载工作区失败" : "没有匹配的工作区"}
      id={id}
      invalid={invalid}
      loading={workspaces.isFetching && results.length === 0}
      onChange={(workspaceId) =>
        onChange(options.find((workspace) => workspace.id === workspaceId) ?? null)
      }
      onSearchChange={(nextQuery) => {
        setActivated(true);
        setQuery(nextQuery);
      }}
      options={options.map(toSelectOption)}
      placeholder="不加入工作区"
      searchPlaceholder="搜索工作区名称或标识"
      value={value?.id ?? null}
    />
  );
}
