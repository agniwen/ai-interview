import { Header, HeaderTitle } from "@mastra/playground-ui/components/Header";
import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "@/components/features/mastra-studio/router/compat";
import { TemplatesList } from "@/components/features/mastra-studio/upstream/domains/templates/templates-list";
import { TemplatesTools } from "@/components/features/mastra-studio/upstream/domains/templates/templates-tools";
import { useMastraTemplates } from "@/components/features/mastra-studio/upstream/hooks/use-templates";
import { cn } from "@/components/features/mastra-studio/upstream/lib/utils";

export default function Templates() {
  const { data, isLoading } = useMastraTemplates();
  const { templates, tags, providers } = data ?? { providers: [], tags: [], templates: [] };
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const tagOptions = [
    { label: "全部标签", value: "all" },
    ...(tags || []).map((tag) => ({ label: tag, value: tag })),
  ];
  const providerOptions = [
    { label: "全部提供商", value: "all" },
    ...(providers || []).map((provider) => ({ label: provider, value: provider })),
  ];

  const handleFilterChange = (value: string, filter: string) => {
    if (filter === "tag") {
      setSelectedTag(value);
    } else if (filter === "provider") {
      setSelectedProvider(value);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleReset = () => {
    setSelectedTag("all");
    setSelectedProvider("all");
    setSearchTerm("");
  };

  const filteredTemplates = templates.filter((template) => {
    if (
      searchTerm &&
      !template.title.toLowerCase().includes(searchTerm) &&
      !template.description.toLowerCase().includes(searchTerm)
    ) {
      return false;
    }
    if (selectedTag !== "all" && !template.tags.includes(selectedTag)) {
      return false;
    }
    if (selectedProvider !== "all" && !template.supportedProviders.includes(selectedProvider)) {
      return false;
    }
    return true;
  });

  const isFiltered = searchTerm || selectedTag !== "all" || selectedProvider !== "all";

  return (
    <MainContentLayout>
      <Header>
        <HeaderTitle>
          <Icon>
            <PackageIcon />
          </Icon>
          模板
        </HeaderTitle>
      </Header>

      <div className={cn("overflow-y-auto w-full h-full px-8 pb-12 z-10")}>
        <TemplatesTools
          selectedTag={selectedTag}
          onTagChange={(value) => handleFilterChange(value, "tag")}
          tagOptions={tagOptions}
          selectedProvider={selectedProvider}
          onProviderChange={(value) => handleFilterChange(value, "provider")}
          providerOptions={providerOptions}
          searchTerm={searchTerm}
          onSearchChange={handleSearch}
          onReset={isFiltered ? handleReset : undefined}
          className="max-w-[80rem]"
          isLoading={isLoading}
        />
        <TemplatesList
          templates={filteredTemplates}
          linkComponent={Link}
          className="max-w-[80rem] mx-auto"
          isLoading={isLoading}
        />
      </div>
    </MainContentLayout>
  );
}
