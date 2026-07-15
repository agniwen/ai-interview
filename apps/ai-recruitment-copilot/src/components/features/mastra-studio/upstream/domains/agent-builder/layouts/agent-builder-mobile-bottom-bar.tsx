import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { Blocks, LibraryIcon, ServerCogIcon, StarIcon } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "@/components/features/mastra-studio/router/compat";
import { useBuilderAgentAccess } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-access";
import { useBuilderAgentFeatures } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-features";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

interface MobileLink {
  name: string;
  url: string;
  icon: React.ReactNode;
}

const agentsLink: MobileLink = {
  icon: <AgentIcon />,
  name: "智能体",
  url: "/agent-builder/agents",
};
const skillsLink: MobileLink = {
  icon: <Blocks className="size-5" />,
  name: "技能",
  url: "/agent-builder/skills",
};
const favoritesLink: MobileLink = {
  icon: <StarIcon className="size-5" />,
  name: "收藏",
  url: "/agent-builder/favorite",
};
const libraryLink: MobileLink = {
  icon: <LibraryIcon className="size-5" />,
  name: "库",
  url: "/agent-builder/library",
};
const infrastructureLink: MobileLink = {
  icon: <ServerCogIcon className="size-5" />,
  name: "基础设施",
  url: "/agent-builder/infrastructure",
};

export function AgentBuilderMobileBottomBar() {
  const { Link } = useLinkComponent();
  const { pathname } = useLocation();
  const features = useBuilderAgentFeatures();
  const { canManageSkills, canUseFavorites } = useBuilderAgentAccess();
  const { hasPermission } = usePermissions();
  const canViewInfrastructure = hasPermission("infrastructure:read");

  const links = useMemo(() => {
    const result: MobileLink[] = [agentsLink];
    if (features.skills && canManageSkills) {
      result.push(skillsLink);
    }
    if (canUseFavorites) {
      result.push(favoritesLink);
    }
    result.push(libraryLink);
    if (canViewInfrastructure) {
      result.push(infrastructureLink);
    }
    return result;
  }, [features.skills, canManageSkills, canUseFavorites, canViewInfrastructure]);

  return (
    <nav
      aria-label="主导航"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border1 bg-surface1/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
      >
        {links.map((link) => {
          const isActive = pathname.startsWith(link.url);
          return (
            <li key={link.name}>
              <Link
                href={link.url}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors duration-normal ease-out-custom ${
                  isActive
                    ? "text-icon6 before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-current"
                    : "text-icon3 hover:text-icon6"
                }`}
              >
                <span className="flex size-6 items-center justify-center" aria-hidden="true">
                  {link.icon}
                </span>
                <span className="leading-none">{link.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
