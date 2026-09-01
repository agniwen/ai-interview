import "reflect-metadata";

import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { CandidateLifecycleModule } from "./candidate-lifecycle/candidate-lifecycle.module.js";
import { CANDIDATE_COPILOT_COMMANDS } from "./candidate-lifecycle/copilot-actions/candidate-copilot.commands.js";
import { CANDIDATE_DOCUMENT_ADMIN_COMMANDS } from "./candidate-lifecycle/documents/candidate-document-admin.commands.js";
import { CANDIDATE_DOCUMENT_COMMANDS } from "./candidate-lifecycle/documents/candidate-document.commands.js";
import { CANDIDATE_EVALUATION_COMMANDS } from "./candidate-lifecycle/evaluations/candidate-evaluation.commands.js";
import { CANDIDATE_SEMANTIC_INDEX_COMMANDS } from "./candidate-lifecycle/semantic-index/candidate-semantic-index.commands.js";
import { CANDIDATE_SETUP_REFRESH_COMMANDS } from "./candidate-lifecycle/setup-refresh/candidate-setup-refresh.commands.js";
import { MAIL_INGEST_ADMIN_COMMANDS } from "./candidate-lifecycle/intake/mail-ingest/mail-ingest-admin.commands.js";
import { CANDIDATE_NOTIFICATION_ADMIN_COMMANDS } from "./candidate-lifecycle/notifications/candidate-notification-admin.commands.js";
import { IdentityAccessModule } from "./identity-access/identity-access.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { MeetingsDomainModule } from "./meetings/meetings-domain.module.js";
import { PlatformOperationsModule } from "./platform-operations/platform-operations.module.js";
import { RecruitingCopilotDomainModule } from "./recruiting-copilot/recruiting-copilot-domain.module.js";
import { RecruitingSetupModule } from "./recruiting-setup/recruiting-setup.module.js";

type ModuleClass = abstract new (...arguments_: never[]) => object;
type ModuleMetadataEntry = object | string | symbol;

export const DOMAIN_MODULES = [
  IdentityAccessModule,
  RecruitingSetupModule,
  JobsModule,
  CandidateLifecycleModule,
  MeetingsDomainModule,
  RecruitingCopilotDomainModule,
  PlatformOperationsModule,
] as const;

function metadata(nestModule: ModuleClass, key: string): ModuleMetadataEntry[] {
  // SAFETY: Nest's @Module decorator stores metadata fields as arrays of tokens/classes.
  return (Reflect.getMetadata(key, nestModule) as ModuleMetadataEntry[] | undefined) ?? [];
}

describe("domain module boundaries", () => {
  it("uses AppModule only as the deployable composition root", () => {
    const rootImports = metadata(AppModule, MODULE_METADATA.IMPORTS);
    for (const domainModule of DOMAIN_MODULES) {
      expect(rootImports).toContain(domainModule);
    }
  });

  it("keeps exports limited to real cross-domain seams", () => {
    for (const domainModule of DOMAIN_MODULES) {
      expect(metadata(domainModule, MODULE_METADATA.EXPORTS)).toEqual(
        domainModule === CandidateLifecycleModule
          ? [
              CANDIDATE_COPILOT_COMMANDS,
              CANDIDATE_DOCUMENT_ADMIN_COMMANDS,
              CANDIDATE_DOCUMENT_COMMANDS,
              CANDIDATE_EVALUATION_COMMANDS,
              CANDIDATE_SEMANTIC_INDEX_COMMANDS,
              CANDIDATE_SETUP_REFRESH_COMMANDS,
              CANDIDATE_NOTIFICATION_ADMIN_COMMANDS,
              MAIL_INGEST_ADMIN_COMMANDS,
            ]
          : [],
      );
    }
  });

  it("does not hide domain cycles with forwardRef", async () => {
    const entries = await readdir(import.meta.dirname, { recursive: true });
    const domainSources = entries.filter(
      (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
    );
    const offenders: string[] = [];
    for (const path of domainSources) {
      const source = await readFile(resolve(import.meta.dirname, path), "utf-8");
      if (source.includes("forwardRef(")) {
        offenders.push(path);
      }
    }

    expect(domainSources).not.toHaveLength(0);
    expect(offenders).toEqual([]);
  });

  it("allows cross-domain imports only through public.ts", async () => {
    const entries = await readdir(import.meta.dirname, { recursive: true });
    const domainSources = entries.filter(
      (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
    );
    const violations: string[] = [];
    for (const path of domainSources) {
      const absolutePath = resolve(import.meta.dirname, path);
      const source = await readFile(absolutePath, "utf-8");
      const [sourceOwner] = path.split("/");
      for (const match of source.matchAll(/from\s+"(?<specifier>\.[^"]+)"/gu)) {
        const specifier = match.groups?.specifier;
        if (!specifier) {
          continue;
        }
        const targetPath = relative(import.meta.dirname, resolve(dirname(absolutePath), specifier));
        if (targetPath.startsWith("..")) {
          continue;
        }
        const [targetOwner] = targetPath.split("/");
        const explicitModuleComposition =
          path.endsWith(".module.ts") && specifier.endsWith(".module.js");
        if (
          targetOwner !== sourceOwner &&
          !specifier.endsWith("/public.js") &&
          !explicitModuleComposition
        ) {
          violations.push(`${path} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps workspace HTTP access outside the identity domain public seam", async () => {
    const identityPublic = await readFile(
      resolve(import.meta.dirname, "identity-access/public.ts"),
      "utf-8",
    );

    expect(identityPublic).not.toMatch(/@nestjs|express|infrastructure\/http|workspace-access/u);
  });

  it("keeps domain public seams free of Nest modules and queue transport DTOs", async () => {
    const entries = await readdir(import.meta.dirname, { recursive: true });
    const publicSeams = entries.filter((path) => path.endsWith("/public.ts"));
    const violations: string[] = [];
    for (const path of publicSeams) {
      const source = await readFile(resolve(import.meta.dirname, path), "utf-8");
      if (
        /@nestjs|express|drizzle-orm|\.module\.js|@arc\/(?:meeting-processing|resume-parse)-queue/u.test(
          source,
        )
      ) {
        violations.push(path);
      }
    }

    expect(publicSeams).not.toHaveLength(0);
    expect(violations).toEqual([]);
  });

  it("keeps central background recovery as an owner-scheduler delegate", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../background/background.recovery.ts"),
      "utf-8",
    );

    expect(source).toContain("CandidateRecoveryScheduler");
    expect(source).toContain("MeetingRecoveryScheduler");
    expect(source).not.toMatch(
      /SchedulerRegistry|setInterval|BACKGROUND_WORKLOAD_ADAPTER|BackgroundQueueProducerService|meeting-answer/u,
    );
  });

  it("limits workspace HTTP infrastructure dependencies to domain controllers and modules", async () => {
    const entries = await readdir(import.meta.dirname, { recursive: true });
    const domainSources = entries.filter(
      (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
    );
    const violations: string[] = [];

    for (const path of domainSources) {
      if (path.endsWith(".controller.ts") || path.endsWith(".module.ts")) {
        continue;
      }
      const source = await readFile(resolve(import.meta.dirname, path), "utf-8");
      if (source.includes("infrastructure/http/workspace-access")) {
        violations.push(path);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps domain workloads behind infrastructure ports", async () => {
    const entries = await readdir(import.meta.dirname, { recursive: true });
    const domainSources = entries.filter(
      (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
    );
    const violations: string[] = [];

    for (const path of domainSources) {
      const source = await readFile(resolve(import.meta.dirname, path), "utf-8");
      if (source.includes("background-infrastructure/")) {
        violations.push(path);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps Platform HTTP services behind operational read models", async () => {
    for (const path of [
      "platform-operations/http/platform.service.ts",
      "platform-operations/http/platform-operations.service.ts",
    ]) {
      const source = await readFile(resolve(import.meta.dirname, path), "utf-8");
      expect(source).not.toMatch(/HTTP_DATABASE|HttpDatabase|drizzle-orm|@arc\/db-schema/u);
    }
  });
});
