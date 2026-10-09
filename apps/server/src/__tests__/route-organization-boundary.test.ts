import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverRoot = path.resolve(import.meta.dirname, "../");
const routesRoot = path.join(serverRoot, "routes");

function toRelative(filePath: string) {
  return path.relative(serverRoot, filePath).split(path.sep).join("/");
}

function collectDirectories(root: string): string[] {
  return [
    root,
    ...readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? collectDirectories(path.join(root, entry.name)) : [],
    ),
  ];
}

function collectSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function isProductionSource(filePath: string) {
  return !(
    filePath.includes(`${path.sep}__tests__${path.sep}`) ||
    /\.(?:spec|test)\.[cm]?tsx?$/.test(filePath)
  );
}

function readSource(filePath: string) {
  return readFileSync(filePath, "utf-8");
}

// Exact existing debt verified against HEAD before the directory migration.
// Remove entries when their persistence ownership is extracted; never widen this list to pass a refactor.
const routeDbDebt = [
  "routes/interview/route.ts",
  "routes/interview/routes/analysis/route.ts",
  "routes/livekit/route.ts",
  "routes/platform/route.ts",
  "routes/public/route.ts",
  "routes/public/routes/background-checks/route.ts",
  "routes/public/routes/human-interview-live-transcript/route.ts",
  "routes/public/routes/offers/route.ts",
  "routes/studio/routes/departments/route.ts",
  "routes/studio/routes/forms/route.ts",
  "routes/studio/routes/interview-questions/route.ts",
  "routes/studio/routes/interviewers/route.ts",
  "routes/studio/routes/interviews/route.ts",
  "routes/studio/routes/interviews/routes/offer-drafts/route.ts",
  "routes/studio/routes/interviews/routes/recordings/route.ts",
  "routes/studio/routes/interviews/routes/round-emails/route.ts",
  "routes/studio/routes/job-descriptions/route.ts",
  "routes/studio/routes/resume-pool/route.ts",
  "routes/studio/routes/resume-upload-batches/route.ts",
  "routes/studio/routes/resumes/route.ts",
  "routes/studio/routes/resumes/routes/evaluation-history/route.ts",
  "routes/studio/routes/resumes/routes/interview-questions/route.ts",
  "routes/studio/routes/resumes/routes/structured-evaluation/route.ts",
  "routes/studio/routes/workspace/route.ts",
];

// Existing concrete persistence imports verified in HEAD, including schema/Drizzle and DB clients.
// Exact paths prevent directory migration from hiding debt or allowing it to grow.
const applicationPersistenceDebt = [
  "routes/interview/application/prepare-question-bindings.ts",
  "routes/public/routes/human-interview-candidate-materials/application/set-question-asked.ts",
  "routes/studio/routes/interviews/application/ensure-human-evaluation-document.ts",
  "routes/studio/routes/interviews/application/human-transcription.ts",
  "routes/studio/routes/interviews/application/sync-cancelled-human-interview-meetings.ts",
  "routes/studio/routes/interviews/routes/round-emails/application/manual-human-email.ts",
  "routes/studio/routes/offer-approvals/application/commands.ts",
  "routes/studio/routes/offer-approvals/application/notifications.ts",
  "routes/studio/routes/offer-approvals/application/publish-offer.ts",
  "routes/studio/routes/offer-approvals/application/queries.ts",
  "routes/studio/routes/offer-approvals/application/templates.ts",
  "routes/studio/routes/resumes/routes/initial-interviews/application/change-initial-interview.ts",
  "routes/studio/routes/resumes/routes/initial-interviews/application/delete-initial-interview.ts",
  "routes/studio/routes/resumes/routes/initial-interviews/application/publish-initial-interview-document.ts",
  "routes/studio/routes/resumes/routes/initial-interviews/application/review-initial-interview.ts",
];

describe("server route organization boundary", () => {
  it("keeps every populated child of a routes directory as a route unit", () => {
    const offenders = collectDirectories(routesRoot)
      .filter((directory) => path.basename(directory) === "routes")
      .flatMap((directory) =>
        readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(directory, entry.name)),
      )
      .filter((directory) => collectSourceFiles(directory).some(isProductionSource))
      .filter((directory) => !existsSync(path.join(directory, "route.ts")))
      .map(toRelative)
      .toSorted();

    expect(offenders).toEqual([]);
  });

  it("does not encode Hono parameters as dynamic-segment directories", () => {
    const offenders = collectDirectories(routesRoot)
      .filter((directory) => /^(?::|\$|\[).+/.test(path.basename(directory)))
      .map(toRelative)
      .toSorted();

    expect(offenders).toEqual([]);
  });

  it("keeps application cores independent from HTTP and the web runtime", () => {
    const forbiddenImport =
      /(?:from\s+["'](?:@hono\/|hono(?:\/|["'])|@tanstack\/|@\/)|import\s+["']@\/)/;
    const offenders = collectSourceFiles(routesRoot)
      .filter(isProductionSource)
      .filter((filePath) => filePath.includes(`${path.sep}application${path.sep}`))
      .filter((filePath) => !path.basename(filePath).startsWith("default-"))
      .filter((filePath) => forbiddenImport.test(readSource(filePath)))
      .map(toRelative)
      .toSorted();

    expect(offenders).toEqual([]);
  });

  it("does not grow application-to-persistence debt", () => {
    const concretePersistenceImport =
      /from\s+["'](?:(?:(?:@(?:app\/server|server)\/)|(?:\.\.\/)+)(?:infrastructure|lib\/server)\/db(?:\/[^"']*)?|@app\/db-schema\/schema|drizzle-orm)["']/;
    const offenders = collectSourceFiles(routesRoot)
      .filter(isProductionSource)
      .filter((filePath) => filePath.includes(`${path.sep}application${path.sep}`))
      .filter((filePath) => !path.basename(filePath).startsWith("default-"))
      .filter((filePath) => concretePersistenceImport.test(readSource(filePath)))
      .map(toRelative)
      .toSorted();

    expect(offenders).toEqual(applicationPersistenceDebt);
  });

  it("keeps DAOs independent from HTTP and the web runtime", () => {
    const forbiddenImport =
      /(?:from\s+["'](?:@hono\/|hono(?:\/|["'])|@tanstack\/|@\/)|import\s+["']@\/)/;
    const offenders = collectSourceFiles(routesRoot)
      .filter(isProductionSource)
      .filter(
        (filePath) =>
          path.basename(filePath) === "dao.ts" || filePath.includes(`${path.sep}dao${path.sep}`),
      )
      .filter((filePath) => forbiddenImport.test(readSource(filePath)))
      .map(toRelative)
      .toSorted();

    expect(offenders).toEqual([]);
  });

  it("does not introduce server-root technical-layer directories", () => {
    const offenders = ["controllers", "queries", "repositories", "services"]
      .filter((directory) => existsSync(path.join(serverRoot, directory)))
      .toSorted();

    expect(offenders).toEqual([]);
  });

  it("does not grow the legacy route-to-database debt", () => {
    const directDbImport =
      /from\s+["'](?:@app\/server\/|(?:\.\.\/)+)(?:infrastructure|lib\/server)\/db(?:\/index)?["']/;
    const offenders = collectSourceFiles(routesRoot)
      .filter((filePath) => path.basename(filePath) === "route.ts")
      .filter((filePath) => directDbImport.test(readSource(filePath)))
      .map(toRelative)
      .toSorted();

    // Remove entries as complete application verbs are extracted from legacy routes.
    expect(offenders).toEqual(routeDbDebt);
  });
});
