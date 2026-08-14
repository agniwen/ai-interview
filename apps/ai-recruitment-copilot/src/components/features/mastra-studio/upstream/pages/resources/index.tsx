import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import {
  BookIcon,
  EarthIcon,
  MessageSquareIcon,
  ExternalLinkIcon,
  CloudUploadIcon,
  BuildingIcon,
} from "lucide-react";
import { EMBEDDED_MASTRA_API_PREFIX } from "@/components/features/mastra-studio/mastra-studio-config";

const resources = [
  {
    description: "使用交互式 Swagger UI 浏览并测试可用的 REST API 端点。",
    external: false,
    href: `${EMBEDDED_MASTRA_API_PREFIX}/swagger-ui`,
    icon: EarthIcon,
    title: "Mastra APIs",
  },
  {
    description: "阅读 Mastra 官方文档中的指南、参考资料和教程。",
    external: true,
    href: "https://mastra.ai/en/docs",
    icon: BookIcon,
    title: "文档",
  },
  {
    description: "浏览源代码、报告问题并参与 Mastra 项目贡献。",
    external: true,
    href: "https://github.com/mastra-ai/mastra",
    icon: ExternalLinkIcon,
    title: "GitHub",
  },
  {
    description: "加入 Mastra Discord 社区，获取帮助、参与讨论与协作。",
    external: true,
    href: "https://discord.gg/BTYqqHKUrf",
    icon: MessageSquareIcon,
    title: "社区",
  },
  {
    description: "正在本地运行 Mastra Studio？部署到云端以便团队协作。",
    external: true,
    href: "https://mastra.ai/cloud",
    icon: CloudUploadIcon,
    title: "与团队共享",
  },
  {
    description: "获取定制演示，讨论本地部署，以及我们如何帮助你加速将智能体投入生产。",
    external: true,
    href: "https://mastra.ai/contact?ref=studio",
    icon: BuildingIcon,
    title: "联系销售团队",
  },
];

export default function Resources() {
  return (
    <PageLayout width="narrow">
      <PageLayout.MainArea>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              {...(resource.external ? { rel: "noreferrer", target: "_blank" } : {})}
              className="group flex flex-col gap-3 rounded-lg border border-border1 bg-surface2 p-5 transition-colors hover:border-accent1 hover:bg-surface3"
            >
              <div className="flex items-center gap-2.5">
                <resource.icon className="h-5 w-5 text-icon3 group-hover:text-accent1 transition-colors" />
                <span className="text-ui-md font-medium text-text1">{resource.title}</span>
                {resource.external && (
                  <ExternalLinkIcon className="h-3.5 w-3.5 text-icon3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              <p className="text-ui-sm text-text3 leading-relaxed">{resource.description}</p>
            </a>
          ))}
        </div>
      </PageLayout.MainArea>
    </PageLayout>
  );
}
