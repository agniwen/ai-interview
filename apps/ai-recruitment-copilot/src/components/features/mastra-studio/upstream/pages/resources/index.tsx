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
    description:
      "Explore and test the available REST API endpoints with the interactive Swagger UI.",
    external: false,
    href: `${EMBEDDED_MASTRA_API_PREFIX}/swagger-ui`,
    icon: EarthIcon,
    title: "Mastra APIs",
  },
  {
    description: "Read the official Mastra documentation for guides, references, and tutorials.",
    external: true,
    href: "https://mastra.ai/en/docs",
    icon: BookIcon,
    title: "Documentation",
  },
  {
    description: "Browse the source code, report issues, and contribute to the Mastra project.",
    external: true,
    href: "https://github.com/mastra-ai/mastra",
    icon: ExternalLinkIcon,
    title: "Github",
  },
  {
    description: "Join the Mastra Discord community for help, discussion, and collaboration.",
    external: true,
    href: "https://discord.gg/BTYqqHKUrf",
    icon: MessageSquareIcon,
    title: "Community",
  },
  {
    description: "Running Mastra Studio locally? Deploy to the cloud so your team can collaborate.",
    external: true,
    href: "https://mastra.ai/cloud",
    icon: CloudUploadIcon,
    title: "Share with your team",
  },
  {
    description:
      "Get a custom demo, discuss on-prem deployments, and how we can help you accelerate getting agents into production.",
    external: true,
    href: "https://mastra.ai/contact?ref=studio",
    icon: BuildingIcon,
    title: "Talk to our Sales team",
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
