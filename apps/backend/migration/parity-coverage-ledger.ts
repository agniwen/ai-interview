import type { BackgroundWorkloadAdapterMethod } from "../src/background-workloads/background-workload.manifest.js";

export type ParityEvidenceCategory = "dual-run-black-box" | "integration-waiver" | "unit-seam";

export interface HttpContractInventoryEntry {
  auth: { level: string };
  id: string;
  method: string;
  path: string;
  transport: { request: string; response: string[] };
}

export interface ParityCoverageEntry {
  category: ParityEvidenceCategory;
  evidence: string;
  id: string;
  waiverReason?: string;
}

const DUAL_RUN_HTTP_EVIDENCE = {
  "GET /api/auth/*":
    "test/contract/protocol-black-box-parity.test.ts#preserves Better Auth callback redirect and cookie protocol without following it",
  "GET /api/join/:code/preview":
    "test/legacy-black-box-parity.test.ts#preserves Hono request rejection while using the intentional Nest error envelope; test/contract/protocol-black-box-parity.test.ts#preserves trusted-origin credentialed CORS preflight semantics",
  "GET /healthz":
    "test/legacy-black-box-parity.test.ts#preserves public health and successful readiness responses",
  "GET /queues/resume-parse/stats":
    "test/legacy-black-box-parity.test.ts#preserves worker diagnostic authentication and successful payloads",
  "GET /readyz":
    "test/legacy-black-box-parity.test.ts#preserves public health and successful readiness responses",
} as const satisfies Readonly<Record<string, string>>;

const KNOWN_HTTP_REQUEST_TRANSPORTS = new Set(["json", "multipart", "none"]);
const KNOWN_HTTP_RESPONSE_TRANSPORTS = new Set(["binary", "empty", "json", "redirect", "stream"]);

function integrationWaiver(contract: HttpContractInventoryEntry): string {
  if (contract.transport.request === "multipart") {
    return "Multipart parity needs an authenticated, seeded PostgreSQL fixture plus isolated object-storage handling so both runtimes can consume identical file bytes without writing production state.";
  }
  if (contract.transport.response.includes("stream")) {
    return "Stream framing and cancellation parity needs deterministic AI/OCR stream fixtures plus seeded authentication and PostgreSQL state; the local suite must not call live model providers.";
  }
  if (contract.transport.response.includes("binary")) {
    return "Binary/download parity needs seeded PostgreSQL records and an isolated S3-compatible fixture (or deterministic export fixture) so content bytes and headers can be compared without external storage.";
  }
  if (contract.transport.response.includes("empty")) {
    return "Empty-body mutation parity needs an isolated authenticated PostgreSQL fixture to compare committed state and the absence of response bytes without touching shared data.";
  }
  if (contract.transport.response.includes("redirect")) {
    return "The remaining redirect branch needs an isolated Better Auth PostgreSQL adapter and controlled OAuth-provider fixture; the GET callback cookie/redirect branch is already dual-run locally.";
  }

  switch (contract.auth.level) {
    case "agent-shared-secret": {
      return "Agent endpoint parity needs a seeded PostgreSQL fixture and deterministic agent-side effects after shared-secret authentication.";
    }
    case "better-auth-native": {
      return "Better Auth handler parity needs an isolated auth PostgreSQL adapter and controlled OAuth/session fixtures.";
    }
    case "candidate-capability":
    case "public-capability":
    case "public-optional-session": {
      return "Capability route parity needs seeded token, interview, and organization rows in an isolated PostgreSQL fixture.";
    }
    case "livekit-webhook-signature": {
      return "Webhook parity needs a deterministic signed LiveKit event and isolated PostgreSQL/queue fixtures to compare state and enqueue side effects.";
    }
    case "platform-admin": {
      return "Platform route parity needs a seeded platform-administrator session and isolated PostgreSQL data.";
    }
    case "public": {
      return "Public route parity needs deterministic provider fixtures and isolated PostgreSQL state so the same request can be compared without external side effects.";
    }
    case "session": {
      return "Session route parity needs a seeded Better Auth session and isolated PostgreSQL data.";
    }
    case "worker-diagnostics-bearer": {
      return "Queue diagnostic parity needs isolated Redis queues with deterministic waiting/active/delayed/failed state.";
    }
    case "workspace-member":
    case "workspace-permission": {
      return "Workspace route parity needs seeded organization, membership, permission, and domain rows in an isolated PostgreSQL fixture.";
    }
    default: {
      throw new Error(`Unclassified HTTP auth boundary for ${contract.id}: ${contract.auth.level}`);
    }
  }
}

function assertKnownContractProtocol(contract: HttpContractInventoryEntry): void {
  if (!KNOWN_HTTP_REQUEST_TRANSPORTS.has(contract.transport.request)) {
    throw new Error(
      `Unclassified HTTP request transport for ${contract.id}: ${contract.transport.request}`,
    );
  }
  for (const response of contract.transport.response) {
    if (!KNOWN_HTTP_RESPONSE_TRANSPORTS.has(response)) {
      throw new Error(`Unclassified HTTP response transport for ${contract.id}: ${response}`);
    }
  }
}

export function buildHttpParityCoverageLedger(
  contracts: readonly HttpContractInventoryEntry[],
): ParityCoverageEntry[] {
  return contracts.map((contract) => {
    assertKnownContractProtocol(contract);
    const dualRunEvidence = Object.entries(DUAL_RUN_HTTP_EVIDENCE).find(
      ([id]) => id === contract.id,
    )?.[1];
    if (dualRunEvidence) {
      return {
        category: "dual-run-black-box",
        evidence: dualRunEvidence,
        id: contract.id,
      };
    }
    return {
      category: "integration-waiver",
      evidence:
        "migration/http-contracts/part-*.json inventory plus test/contract/openapi.contract.test.ts route/schema coverage",
      id: contract.id,
      waiverReason: integrationWaiver(contract),
    };
  });
}

interface WorkloadCoverageEntry extends ParityCoverageEntry {
  id: BackgroundWorkloadAdapterMethod;
}

export const BACKGROUND_WORKLOAD_PARITY_LEDGER = {
  assertConfigured: {
    category: "unit-seam",
    evidence:
      "src/background-workloads/background-workload.adapter.test.ts#fails fast with the exact missing workload port instead of starting a no-op worker",
    id: "assertConfigured",
  },
  listRecoverableMeetingAnswerJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableMeetingAnswerJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL meeting-answer rows and Redis job state to compare the exact recoverable set.",
  },
  listRecoverableMeetingIntelligenceJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableMeetingIntelligenceJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL intelligence runs and Redis job state to compare the exact recoverable set.",
  },
  listRecoverableMeetingPlaybackJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableMeetingPlaybackJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL meeting recordings and Redis playback jobs to compare the exact recoverable set.",
  },
  listRecoverableMeetingPurgeJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableMeetingPurgeJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL retention rows and Redis purge jobs to compare the exact recoverable set.",
  },
  listRecoverableMeetingTranscriptionJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableMeetingTranscriptionJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL source manifests and Redis transcription jobs to compare the exact recoverable set.",
  },
  listRecoverableResumeParseJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableResumeParseJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL upload batches and Redis parse jobs to compare the exact recoverable set.",
  },
  listRecoverableResumeSemanticIndexJobs: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts recovery delegation",
    id: "listRecoverableResumeSemanticIndexJobs",
    waiverReason:
      "Recovery parity needs isolated PostgreSQL resume state plus Redis and vector-index fixtures to compare the exact recoverable set.",
  },
  loadMeetingOperationsSnapshot: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts operations delegation",
    id: "loadMeetingOperationsSnapshot",
    waiverReason:
      "Snapshot parity needs seeded meeting-operation rows in isolated PostgreSQL and deterministic clock values.",
  },
  pingDependencies: {
    category: "integration-waiver",
    evidence: "src/background-workloads/background-workload.adapter.test.ts dependency port wiring",
    id: "pingDependencies",
    waiverReason:
      "Dependency-health parity needs isolated PostgreSQL, Redis, and object-storage services with controllable failure modes.",
  },
  prepareMeetingTranscription: {
    category: "unit-seam",
    evidence:
      "src/background-workloads/background-workload.adapter.test.ts#forwards transcription preparation, meeting answers, and job failures to their ports",
    id: "prepareMeetingTranscription",
  },
  processInterviewNotificationBatch: {
    category: "unit-seam",
    evidence:
      "src/domains/candidate-lifecycle/workloads/interview-notification.processor.test.ts#claims a scheduler batch through the public port and reports the processed count",
    id: "processInterviewNotificationBatch",
  },
  processMeetingAnswer: {
    category: "unit-seam",
    evidence:
      "src/background-workloads/background-workload.adapter.test.ts#forwards transcription preparation, meeting answers, and job failures to their ports",
    id: "processMeetingAnswer",
  },
  processMeetingIntelligence: {
    category: "unit-seam",
    evidence:
      "src/domains/meetings/workloads/meeting-processors.seam.test.ts#does not invoke intelligence generation when another worker owns the lease",
    id: "processMeetingIntelligence",
  },
  processMeetingPlayback: {
    category: "unit-seam",
    evidence:
      "src/domains/meetings/workloads/meeting-processors.seam.test.ts#keeps ready playback idempotent before claiming a new processing run",
    id: "processMeetingPlayback",
  },
  processMeetingPurge: {
    category: "unit-seam",
    evidence:
      "src/domains/meetings/workloads/meeting-processors.seam.test.ts#does not run destructive purge operations when the DB lease is not claimed",
    id: "processMeetingPurge",
  },
  processMeetingTranscription: {
    category: "unit-seam",
    evidence:
      "src/domains/meetings/workloads/meeting-processors.seam.test.ts#fails transcription explicitly when the source meeting is absent",
    id: "processMeetingTranscription",
  },
  processResumeParse: {
    category: "unit-seam",
    evidence:
      "src/domains/candidate-lifecycle/workloads/resume.processor.test.ts#maps the public retry seam into the migrated bulk workflow",
    id: "processResumeParse",
  },
  processResumeReviewGeneration: {
    category: "integration-waiver",
    evidence: "src/background-infrastructure/background-core.service.test.ts review delegation",
    id: "processResumeReviewGeneration",
    waiverReason:
      "Review generation parity needs seeded resume/JD rows and a deterministic model-provider fixture to compare persisted review state.",
  },
  processResumeSemanticIndex: {
    category: "unit-seam",
    evidence:
      "src/domains/candidate-lifecycle/workloads/resume.processor.test.ts#routes job descriptions to the JD indexer without touching resume enrichment",
    id: "processResumeSemanticIndex",
  },
  recoverMissingMeetingIntelligence: {
    category: "integration-waiver",
    evidence:
      "src/background-infrastructure/background-core.service.test.ts intelligence recovery delegation",
    id: "recoverMissingMeetingIntelligence",
    waiverReason:
      "Recovery parity needs seeded PostgreSQL meetings and deterministic Redis intelligence jobs to compare inserted and skipped work.",
  },
  reportJobFailure: {
    category: "unit-seam",
    evidence:
      "src/background-workloads/background-workload.adapter.test.ts#forwards transcription preparation, meeting answers, and job failures to their ports",
    id: "reportJobFailure",
  },
  runMailIngest: {
    category: "unit-seam",
    evidence:
      "src/domains/candidate-lifecycle/workloads/mail-ingest.processor.test.ts#honors organization-scoped account discovery before opening IMAP",
    id: "runMailIngest",
  },
} as const satisfies Record<BackgroundWorkloadAdapterMethod, WorkloadCoverageEntry>;
