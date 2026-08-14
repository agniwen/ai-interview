import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { SectionCard } from "@mastra/playground-ui/components/SectionCard";
import { useStudioConfig } from "@/components/features/mastra-studio/upstream/domains/configuration/context/studio-config-state";

export const StudioSettingsPage = () => {
  const { baseUrl, apiPrefix } = useStudioConfig();

  return (
    <PageLayout width="narrow">
      <PageLayout.MainArea className="flex flex-col gap-5 mt-6">
        <SectionCard
          title="Mastra 连接"
          description="此嵌入式 Studio 与 ARC 使用同一个 Mastra 实例，连接由宿主应用管理。"
        >
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-neutral3">实例 URL</dt>
              <dd className="break-all text-neutral6">{baseUrl}</dd>
            </div>
            <div>
              <dt className="text-neutral3">API 前缀</dt>
              <dd className="break-all text-neutral6">{apiPrefix}</dd>
            </div>
          </dl>
        </SectionCard>
      </PageLayout.MainArea>
    </PageLayout>
  );
};
