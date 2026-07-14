import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { SectionCard } from "@mastra/playground-ui/components/SectionCard";
import { useStudioConfig } from "@/components/features/mastra-studio/upstream/domains/configuration/context/studio-config-state";

export const StudioSettingsPage = () => {
  const { baseUrl, apiPrefix } = useStudioConfig();

  return (
    <PageLayout width="narrow">
      <PageLayout.MainArea className="flex flex-col gap-5 mt-6">
        <SectionCard
          title="Mastra Connection"
          description="This embedded Studio uses the same Mastra instance as ARC. The connection is managed by the host application."
        >
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-neutral3">Instance URL</dt>
              <dd className="break-all text-neutral6">{baseUrl}</dd>
            </div>
            <div>
              <dt className="text-neutral3">API prefix</dt>
              <dd className="break-all text-neutral6">{apiPrefix}</dd>
            </div>
          </dl>
        </SectionCard>
      </PageLayout.MainArea>
    </PageLayout>
  );
};
