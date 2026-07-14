"use client";

import {
  Link as TanStackLink,
  Outlet as TanStackOutlet,
  useLocation as useTanStackLocation,
  useMatches as useTanStackMatches,
  useNavigate as useTanStackNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { forwardRef, useCallback, useEffect, useMemo } from "react";
import type { AnchorHTMLAttributes, ComponentProps } from "react";
import {
  addMastraStudioBase,
  isMastraStudioPath,
  MASTRA_STUDIO_ROUTE_BASE,
  removeMastraStudioBase,
} from "./studio-route-path";

const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

export interface NavigateOptions {
  preventScrollReset?: boolean;
  relative?: "path" | "route";
  replace?: boolean;
  state?: unknown;
  viewTransition?: boolean;
}

export type NavigateFunction = (
  to: number | string,
  options?: NavigateOptions,
) => void | Promise<void>;

export interface Location<State = unknown> {
  hash: string;
  key: string;
  pathname: string;
  search: string;
  state: State;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  preventScrollReset?: boolean;
  relative?: "path" | "route";
  replace?: boolean;
  state?: unknown;
  to: string;
  viewTransition?: boolean;
}

function isExternalUrl(to: string) {
  return EXTERNAL_URL.test(to);
}

export {
  addMastraStudioBase,
  isMastraStudioPath,
  MASTRA_STUDIO_ROUTE_BASE,
  removeMastraStudioBase,
};

function useEmbeddedStudioPath() {
  return useTanStackLocation({
    select: (location) => isMastraStudioPath(location.pathname),
  });
}

function resolveInternalTo(to: string, embedded: boolean) {
  return embedded ? addMastraStudioBase(to) : to;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    children,
    preventScrollReset,
    relative: _relative,
    replace,
    state,
    to,
    viewTransition,
    ...props
  },
  ref,
) {
  const embedded = useEmbeddedStudioPath();
  const resolvedTo = resolveInternalTo(to, embedded);

  if (isExternalUrl(resolvedTo)) {
    return (
      <a {...props} href={resolvedTo} ref={ref}>
        {children}
      </a>
    );
  }

  return (
    <TanStackLink
      {...(props as ComponentProps<typeof TanStackLink>)}
      preload="intent"
      ref={ref}
      replace={replace}
      resetScroll={!preventScrollReset}
      state={state as never}
      to={resolvedTo as never}
      viewTransition={viewTransition}
    >
      {children}
    </TanStackLink>
  );
});

export function useNavigate(): NavigateFunction {
  const embedded = useEmbeddedStudioPath();
  const navigate = useTanStackNavigate();
  const router = useRouter();

  return useCallback(
    (to, options = {}) => {
      if (typeof to === "number") {
        return router.history.go(to);
      }

      const resolvedTo = resolveInternalTo(to, embedded);
      if (isExternalUrl(resolvedTo)) {
        window.location.assign(resolvedTo);
        return;
      }

      return navigate({
        replace: options.replace,
        resetScroll: !options.preventScrollReset,
        state: options.state as never,
        to: resolvedTo as never,
        viewTransition: options.viewTransition,
      });
    },
    [embedded, navigate, router],
  );
}

export function Navigate({
  preventScrollReset,
  replace,
  state,
  to,
  viewTransition,
}: { to: string } & NavigateOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate(to, {
      preventScrollReset,
      replace,
      state,
      viewTransition,
    });
  }, [navigate, preventScrollReset, replace, state, to, viewTransition]);

  return null;
}

export function useLocation<State = unknown>(): Location<State> {
  const location = useTanStackLocation();

  return useMemo(
    () => ({
      hash: location.hash,
      key: String(location.state.__TSR_key ?? "default"),
      pathname: removeMastraStudioBase(location.pathname),
      search: location.searchStr,
      state: location.state as State,
    }),
    [location],
  );
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  const params = useRouterState({
    select: (state): Record<string, string | undefined> => state.matches.at(-1)?.params ?? {},
  });
  return params as T;
}

export function useMatches() {
  const matches = useTanStackMatches();

  return useMemo(
    () =>
      matches.map((match) => ({
        data: match.loaderData,
        handle: (match.staticData as { handle?: unknown } | undefined)?.handle,
        id: match.routeId,
        params: match.params,
        pathname: removeMastraStudioBase(match.pathname),
      })),
    [matches],
  );
}

type SearchParamsInit = Record<string, string | string[]> | URLSearchParams | string | string[][];

type SetSearchParams = (
  nextInit: SearchParamsInit | ((previous: URLSearchParams) => SearchParamsInit),
  options?: NavigateOptions,
) => void;

function createNativeSearchParams(init: SearchParamsInit) {
  if (typeof init === "string" || init instanceof URLSearchParams || Array.isArray(init)) {
    return new URLSearchParams(init as string | string[][] | URLSearchParams);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(init)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item);
    }
  }
  return params;
}

export function buildSearchHref(pathname: string, params: URLSearchParams, hash = "") {
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const location = useTanStackLocation();
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(location.searchStr), [location.searchStr]);

  const setSearchParams = useCallback<SetSearchParams>(
    (nextInit, options = {}) => {
      const next =
        typeof nextInit === "function"
          ? nextInit(new URLSearchParams(location.searchStr))
          : nextInit;
      const nextParams = createNativeSearchParams(next);

      void router.navigate({
        href: buildSearchHref(location.pathname, nextParams, location.hash),
        replace: options.replace,
        resetScroll: !options.preventScrollReset,
        state: options.state as never,
        viewTransition: options.viewTransition,
      });
    },
    [location.hash, location.pathname, location.searchStr, router],
  );

  return [params, setSearchParams];
}

export const Outlet = TanStackOutlet;
