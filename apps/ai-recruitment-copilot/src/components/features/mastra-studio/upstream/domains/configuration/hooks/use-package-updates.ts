import { useQueries } from "@tanstack/react-query";
import semver from "semver";

export interface PackageInfo {
  name: string;
  version: string;
}

export interface PackageUpdateInfo extends PackageInfo {
  latestVersion: string | null;
  isOutdated: boolean;
  isDeprecated: boolean;
  prereleaseTag: string | null;
  targetPrereleaseTag: string | null;
  deprecationMessage?: string;
}

interface NpmPackageResponse {
  "dist-tags": {
    latest: string;
  };
  versions: Record<
    string,
    {
      deprecated?: string;
    }
  >;
}

async function fetchPackageInfo(
  packageName: string,
  installedVersion: string,
): Promise<PackageUpdateInfo> {
  const prereleaseComponents = semver.prerelease(installedVersion);
  // Extract the tag name (e.g., 'beta' from ['beta', 13])
  const prereleaseTag = prereleaseComponents ? String(prereleaseComponents[0]) : null;

  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);

    if (!response.ok) {
      return {
        isDeprecated: false,
        isOutdated: false,
        latestVersion: null,
        name: packageName,
        prereleaseTag,
        targetPrereleaseTag: null,
        version: installedVersion,
      };
    }

    const data: NpmPackageResponse = await response.json();
    const latestVersion = data["dist-tags"]?.latest ?? null;
    const versionInfo = data.versions?.[installedVersion];
    const deprecationMessage = versionInfo?.deprecated;

    // Extract the prerelease tag from the target version (e.g., 'beta' from '1.0.0-beta.13')
    const targetPrereleaseComponents = latestVersion ? semver.prerelease(latestVersion) : null;
    const targetPrereleaseTag = targetPrereleaseComponents
      ? String(targetPrereleaseComponents[0])
      : null;

    // Determine if outdated using semver.gt (greater than)
    // Only mark as outdated if latest is actually newer than installed
    let isOutdated = false;
    if (latestVersion !== null && semver.valid(installedVersion) && semver.valid(latestVersion)) {
      isOutdated = semver.gt(latestVersion, installedVersion);
    }

    return {
      deprecationMessage,
      isDeprecated: !!deprecationMessage,
      isOutdated,
      latestVersion,
      name: packageName,
      prereleaseTag,
      targetPrereleaseTag,
      version: installedVersion,
    };
  } catch {
    return {
      isDeprecated: false,
      isOutdated: false,
      latestVersion: null,
      name: packageName,
      prereleaseTag,
      targetPrereleaseTag: null,
      version: installedVersion,
    };
  }
}

export function usePackageUpdates(packages: PackageInfo[]) {
  const queries = useQueries({
    queries: packages.map((pkg) => ({
      // 24 hours.
      gcTime: 1000 * 60 * 60 * 24,
      queryFn: () => fetchPackageInfo(pkg.name, pkg.version),
      queryKey: ["package-update", pkg.name, pkg.version],
      // One hour; latest versions do not change often.
      staleTime: 1000 * 60 * 60,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const packageUpdates = queries
    .map((q) => q.data)
    .filter((p): p is PackageUpdateInfo => p !== undefined);

  // Only compute counts when all queries are complete to avoid incrementing badges
  const allComplete = !isLoading && packageUpdates.length === packages.length;
  const outdatedCount = allComplete
    ? packageUpdates.filter((p) => p.isOutdated && !p.isDeprecated).length
    : 0;
  const deprecatedCount = allComplete ? packageUpdates.filter((p) => p.isDeprecated).length : 0;

  return {
    deprecatedCount,
    isLoading,
    outdatedCount,
    packages: packageUpdates,
  };
}
