import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { MetricsFlexGrid } from "@mastra/playground-ui/components/MetricsFlexGrid";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { PropertyFilterCreator } from "@mastra/playground-ui/components/PropertyFilter";
import type { PropertyFilterToken } from "@mastra/playground-ui/components/PropertyFilter";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { DateRangeSelector } from "@mastra/playground-ui/domains/metrics/components/date-range-selector";
import { useAgentRunsKpiMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-agent-runs-kpi-metrics";
import {
  MetricsProvider,
  isValidPreset,
  useMetrics,
} from "@mastra/playground-ui/domains/metrics/hooks/use-metrics";
import type {
  DatePreset,
  DateRange,
} from "@mastra/playground-ui/domains/metrics/hooks/use-metrics";
import {
  applyMetricsPropertyFilterTokens,
  clearSavedMetricsFilters,
  createMetricsPropertyFilterFields,
  getMetricsPropertyFilterTokens,
  hasAnyMetricsFilterParams,
  loadMetricsFiltersFromStorage,
  saveMetricsFiltersToStorage,
} from "@mastra/playground-ui/domains/metrics/metrics-filters";
import { useEntityNames } from "@mastra/playground-ui/domains/traces/hooks/use-entity-names";
import { useEnvironments } from "@mastra/playground-ui/domains/traces/hooks/use-environments";
import { useServiceNames } from "@mastra/playground-ui/domains/traces/hooks/use-service-names";
import { useTags } from "@mastra/playground-ui/domains/traces/hooks/use-tags";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { toast } from "@mastra/playground-ui/utils/toast";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "@/components/features/mastra-studio/router/compat";
import { useMastraPackages } from "@/components/features/mastra-studio/upstream/domains/configuration/hooks/use-mastra-packages";
import { LatencyCard } from "@/components/features/mastra-studio/upstream/domains/metrics/components/latency-card";
import { MemoryCard } from "@/components/features/mastra-studio/upstream/domains/metrics/components/memory-card";
import {
  ActiveResourcesKpiCard,
  ActiveThreadsKpiCard,
  AgentRunsKpiCard,
  ModelCostKpiCard,
  TotalTokensKpiCard,
} from "@/components/features/mastra-studio/upstream/domains/metrics/components/metrics-kpi-cards";
import { MetricsToolbar } from "@/components/features/mastra-studio/upstream/domains/metrics/components/metrics-toolbar";
import { ModelUsageCostCard } from "@/components/features/mastra-studio/upstream/domains/metrics/components/model-usage-cost-card";
import { TokenUsageByAgentCard } from "@/components/features/mastra-studio/upstream/domains/metrics/components/token-usage-by-agent-card";
import { TokenUsageTimelineCard } from "@/components/features/mastra-studio/upstream/domains/metrics/components/token-usage-timeline-card";
import { TracesVolumeCard } from "@/components/features/mastra-studio/upstream/domains/metrics/components/traces-volume-card";

const ANALYTICS_OBSERVABILITY_TYPES = new Set([
  "ObservabilityStorageClickhouseVNext",
  "ObservabilityStorageDuckDB",
  "ObservabilityInMemory",
  "ObservabilitySpanner",
  "ObservabilityStoragePostgresVNext",
]);

const PERIOD_PARAM = "period";
const DATE_FROM_PARAM = "dateFrom";
const DATE_TO_PARAM = "dateTo";

function MetricsStorageContent({
  isInMemory,
  isLoading,
  supportsMetrics,
}: {
  isInMemory: boolean;
  isLoading: boolean;
  supportsMetrics: boolean;
}) {
  if (isLoading) {
    return null;
  }

  if (!supportsMetrics) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          iconSlot={<CircleSlashIcon />}
          titleSlot="当前存储不支持指标"
          descriptionSlot="指标需要使用 ClickHouse、DuckDB、Postgres v-next、Spanner 或内存存储作为可观测性存储。其他关系型数据库（LibSQL、MSSQL）和文档数据库（MongoDB）不支持指标采集。若要为现有项目启用指标，请在 Mastra 配置中切换可观测性存储。"
          actionSlot={
            <Button
              variant="ghost"
              as="a"
              href="https://mastra.ai/docs/observability/metrics/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              指标文档 <ExternalLinkIcon />
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-8 content-start pb-10">
      {isInMemory && (
        <Notice variant="info" title="指标不会持久化">
          <Notice.Message>
            此项目使用内存存储保存可观测性数据，服务器每次重启后指标都会丢失。如需持久保存指标，
            请将可观测性存储切换为 ClickHouse、DuckDB、Postgres v-next 或 Spanner。
          </Notice.Message>
        </Notice>
      )}

      <MetricsFlexGrid>
        <AgentRunsKpiCard />
        <ModelCostKpiCard />
        <TotalTokensKpiCard />
        <ActiveThreadsKpiCard />
        <ActiveResourcesKpiCard />
      </MetricsFlexGrid>

      <MetricsFlexGrid>
        <ModelUsageCostCard />
        <TokenUsageByAgentCard />
        <TokenUsageTimelineCard />
        <MemoryCard />
        <TracesVolumeCard />
        <LatencyCard />
      </MetricsFlexGrid>
    </div>
  );
}

function MetricsContent() {
  const [searchParams] = useSearchParams();
  const { error, isLoading: isMetricsLoading } = useAgentRunsKpiMetrics();
  const { filterTokens, setFilterTokens } = useMetrics();
  const [autoFocusFilterFieldId, setAutoFocusFilterFieldId] = useState<string | undefined>();

  const { data: packagesData, isLoading: isPackagesLoading } = useMastraPackages();
  const observabilityType = packagesData?.observabilityStorageType;
  const supportsMetrics = observabilityType
    ? ANALYTICS_OBSERVABILITY_TYPES.has(observabilityType)
    : false;
  const isInMemory = observabilityType === "ObservabilityInMemory";

  const { data: tagsData, isLoading: isTagsLoading } = useTags();
  const { data: entityNamesData, isLoading: isEntityNamesLoading } = useEntityNames();
  const { data: serviceNamesData, isLoading: isServiceNamesLoading } = useServiceNames();
  const { data: environmentsData, isLoading: isEnvironmentsLoading } = useEnvironments();

  const filterFields = useMemo(
    () =>
      createMetricsPropertyFilterFields({
        availableEntityNames: entityNamesData ?? [],
        availableEnvironments: environmentsData ?? [],
        availableServiceNames: serviceNamesData ?? [],
        availableTags: tagsData ?? [],
        loading: {
          entityNames: isEntityNamesLoading,
          environments: isEnvironmentsLoading,
          serviceNames: isServiceNamesLoading,
          tags: isTagsLoading,
        },
      }),
    [
      tagsData,
      entityNamesData,
      serviceNamesData,
      environmentsData,
      isTagsLoading,
      isEntityNamesLoading,
      isServiceNamesLoading,
      isEnvironmentsLoading,
    ],
  );

  const [hasSavedFilters, setHasSavedFilters] = useState(
    () => loadMetricsFiltersFromStorage() !== null,
  );

  const handleSave = useCallback(() => {
    saveMetricsFiltersToStorage(searchParams);
    setHasSavedFilters(true);
    toast.success("已保存指标筛选设置");
  }, [searchParams]);

  const handleRemoveSaved = useCallback(() => {
    clearSavedMetricsFilters();
    setHasSavedFilters(false);
    toast.success("已清除指标筛选设置");
  }, []);

  const handleRemoveAll = useCallback(() => {
    setFilterTokens([]);
  }, [setFilterTokens]);

  const handleClear = useCallback(() => {
    const neutralTokens: PropertyFilterToken[] = filterTokens.map((token) => {
      const field = filterFields.find((f) => f.id === token.fieldId);
      if (!field) {
        return token;
      }
      if (field.kind === "text") {
        return { fieldId: token.fieldId, value: "" };
      }
      if (field.kind === "pick-multi") {
        return field.multi
          ? { fieldId: token.fieldId, value: [] }
          : { fieldId: token.fieldId, value: "Any" };
      }
      if (field.kind === "multi-select") {
        return { fieldId: token.fieldId, value: [] };
      }
      return token;
    });
    setFilterTokens(neutralTokens);
  }, [filterFields, filterTokens, setFilterTokens]);

  if (error && is401UnauthorizedError(error)) {
    return (
      <NoDataPageLayout>
        <SessionExpired />
      </NoDataPageLayout>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <NoDataPageLayout>
        <PermissionDenied resource="指标" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="加载指标失败" message={error.message} />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout width="wide" height="full">
      <PageLayout.TopArea>
        <PageLayout.Row>
          <PageLayout.Column className="flex flex-wrap items-start justify-start gap-2">
            <DateRangeSelector />
            <PropertyFilterCreator
              fields={filterFields}
              tokens={filterTokens}
              onTokensChange={setFilterTokens}
              disabled={isMetricsLoading}
              onStartTextFilter={setAutoFocusFilterFieldId}
            />
          </PageLayout.Column>
        </PageLayout.Row>

        <MetricsToolbar
          isLoading={isMetricsLoading}
          filterFields={filterFields}
          filterTokens={filterTokens}
          onFilterTokensChange={setFilterTokens}
          onClear={handleClear}
          onRemoveAll={handleRemoveAll}
          onSave={handleSave}
          onRemoveSaved={hasSavedFilters ? handleRemoveSaved : undefined}
          autoFocusFilterFieldId={autoFocusFilterFieldId}
        />
      </PageLayout.TopArea>

      <MetricsStorageContent
        isInMemory={isInMemory}
        isLoading={isPackagesLoading}
        supportsMetrics={supportsMetrics}
      />
    </PageLayout>
  );
}

export default function Metrics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsDigest = searchParams.toString();

  const urlPreset = searchParams.get(PERIOD_PARAM);
  const preset: DatePreset = isValidPreset(urlPreset) ? urlPreset : "24h";

  // Concrete from/to bounds only apply to the 'custom' preset; relative presets
  // derive their window from the preset alone.
  const customRange = useMemo<DateRange | undefined>(() => {
    if (preset !== "custom") {
      return;
    }
    const parseBound = (raw: string | null) => {
      if (!raw) {
        return;
      }
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };
    const currentSearchParams = new URLSearchParams(searchParamsDigest);
    const from = parseBound(currentSearchParams.get(DATE_FROM_PARAM));
    const to = parseBound(currentSearchParams.get(DATE_TO_PARAM));
    if (!from && !to) {
      return;
    }
    return { from, to };
  }, [preset, searchParamsDigest]);

  // Derive tokens straight from the URL. Memoized on a stable digest so the
  // array identity only changes when the URL actually changes — this prevents
  // a feedback loop where `searchParams` is mutated and immediately parsed
  // back into a new tokens reference.
  const filterTokens = useMemo(
    () => getMetricsPropertyFilterTokens(new URLSearchParams(searchParamsDigest)),
    [searchParamsDigest],
  );

  const handlePresetChange = useCallback(
    (next: DatePreset) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === "24h") {
            params.delete(PERIOD_PARAM);
          } else {
            params.set(PERIOD_PARAM, next);
          }
          if (next !== "custom") {
            params.delete(DATE_FROM_PARAM);
            params.delete(DATE_TO_PARAM);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleCustomRangeChange = useCallback(
    (range: DateRange | undefined) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (range?.from) {
            params.set(DATE_FROM_PARAM, range.from.toISOString());
          } else {
            params.delete(DATE_FROM_PARAM);
          }
          if (range?.to) {
            params.set(DATE_TO_PARAM, range.to.toISOString());
          } else {
            params.delete(DATE_TO_PARAM);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleFilterTokensChange = useCallback(
    (nextTokens: PropertyFilterToken[]) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          applyMetricsPropertyFilterTokens(params, nextTokens);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Hydrate saved filters on first mount if URL is filter-clean.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    if (hasAnyMetricsFilterParams(searchParams)) {
      return;
    }
    const saved = loadMetricsFiltersFromStorage();
    if (!saved) {
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of saved) {
          next.append(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  return (
    <MetricsProvider
      preset={preset}
      filterTokens={filterTokens}
      onPresetChange={handlePresetChange}
      onFilterTokensChange={handleFilterTokensChange}
      customRange={customRange}
      onCustomRangeChange={handleCustomRangeChange}
    >
      <MetricsContent />
    </MetricsProvider>
  );
}
