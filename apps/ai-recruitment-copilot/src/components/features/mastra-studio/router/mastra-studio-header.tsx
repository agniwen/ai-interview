"use client";

import { IconBook2 } from "@tabler/icons-react";
import { Fragment } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { CrumbDef } from "@/components/features/mastra-studio/upstream/lib/route-header";
import {
  RouteHeaderActionsSlot,
  useRouteHeader,
  useRouteHeaderCrumbsOverride,
} from "@/components/features/mastra-studio/upstream/lib/route-header";
import { SidebarInsetHeader } from "@/components/layout/app-sidebar/sidebar-inset-header";
import { resolvePlatformSidebarNavItem } from "@/components/features/platform/platform-sidebar-slots";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Link } from "./compat";

function CrumbContent({ crumb }: { crumb: CrumbDef }) {
  if ("Component" in crumb && crumb.Component) {
    const { Component } = crumb;
    return <Component />;
  }

  if ("node" in crumb) {
    return <>{crumb.node}</>;
  }

  return <>{crumb.label}</>;
}

function MastraBreadcrumb({
  crumbs,
  hideCurrentIcon,
}: {
  crumbs: CrumbDef[];
  hideCurrentIcon: boolean;
}) {
  if (crumbs.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Mastra Studio</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          const Icon = crumb.icon;
          const showIcon = Icon && !(isCurrent && hideCurrentIcon);

          return (
            <Fragment key={crumb.id}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className="min-w-0 shrink-0 last:shrink">
                {isCurrent || !crumb.to ? (
                  <BreadcrumbPage className="flex min-w-0 items-center gap-1.5">
                    {showIcon ? <Icon className="size-4 shrink-0" /> : null}
                    <span className="truncate">
                      <CrumbContent crumb={crumb} />
                    </span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="flex min-w-0 items-center gap-1.5"
                    render={<Link to={crumb.to} viewTransition />}
                  >
                    {showIcon ? <Icon className="size-4 shrink-0" /> : null}
                    <span className="truncate">
                      <CrumbContent crumb={crumb} />
                    </span>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function MastraStudioHeader() {
  const { crumbs, docs } = useRouteHeader();
  const overrideCrumbs = useRouteHeaderCrumbsOverride();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const ActiveMenuIcon = resolvePlatformSidebarNavItem(pathname)?.icon;

  return (
    <SidebarInsetHeader
      activeMenuIcon={ActiveMenuIcon ? <ActiveMenuIcon /> : undefined}
      actions={
        <>
          <RouteHeaderActionsSlot className="contents" />
          {docs ? (
            <Button
              nativeButton={false}
              render={
                <a
                  aria-label={docs.label ?? "文档"}
                  href={docs.href}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
              size="sm"
              variant="ghost"
            >
              <IconBook2 data-icon="inline-start" />
              <span className="hidden max-w-48 truncate sm:inline">{docs.label ?? "文档"}</span>
            </Button>
          ) : null}
        </>
      }
      breadcrumb={
        <MastraBreadcrumb
          crumbs={overrideCrumbs ?? crumbs}
          hideCurrentIcon={Boolean(ActiveMenuIcon)}
        />
      }
    />
  );
}
