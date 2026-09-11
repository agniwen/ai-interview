import { afterEach, expect, it, vi } from "vitest";
import { aiInterviewRound } from "@app/db-schema/schema";
import { db } from "../../../../../../../../lib/server/db/index";
import {
  previewManualAiInvitation,
  confirmManualAiInvitation,
  signManualInvitationPreview,
} from "../application/default-manual-ai-invitation";

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isLocal =
  target?.hostname === "127.0.0.1" &&
  target.port === "54323" &&
  target.pathname === "/ainterview_local";
afterEach(() => vi.unstubAllEnvs());

it.skipIf(!isLocal).each(["preview", "confirm"])(
  "blocks %s when the candidate is outside the current visibility scope",
  async (operation) => {
    vi.stubEnv("BETTER_AUTH_SECRET", "visibility-test-only");
    const [round] = await db.select().from(aiInterviewRound).limit(1);
    if (!round) {
      throw new Error("Local test round missing");
    }
    const actor = {
      actorUserId: "visibility-test-hr",
      organizationId: round.organizationId,
      roundId: round.id,
      visibility: { kind: "none" as const },
    };
    const token = signManualInvitationPreview({
      ...actor,
      expiresAt: Date.now() + 60_000,
      fingerprint: "unused",
      requestId: crypto.randomUUID(),
    });
    await expect(
      operation === "preview"
        ? previewManualAiInvitation(actor)
        : confirmManualAiInvitation(actor, token),
    ).rejects.toMatchObject({
      message: "面试轮次不存在或无权查看。",
      status: 404,
    });
  },
);
