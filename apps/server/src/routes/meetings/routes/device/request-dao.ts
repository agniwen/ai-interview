import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { meetingDeviceRequest } from "@app/db-schema/schema";
import type { Database } from "@app/database";
import type { JsonValue } from "@app/db-schema/json";
import { lockEchoDeviceMeeting } from "./ownership-dao";
import type { EchoProcessingActor } from "./ownership-dao";
import { EchoProcessingError } from "./error";

export interface EchoRequestInput extends EchoProcessingActor {
  operationId: string;
  kind: string;
  payload: JsonValue;
}
export type EchoRequestClaim =
  | { state: "busy" }
  | { state: "complete"; result: JsonValue }
  | { state: "claimed"; token: string };

export function createEchoRequestDao(db: Database) {
  return {
    claim: (input: EchoRequestInput): Promise<EchoRequestClaim> =>
      db.transaction(async (tx) => {
        await lockEchoDeviceMeeting(tx, input);
        const requestHash = createHash("sha256")
          .update(JSON.stringify(input.payload))
          .digest("hex");
        const [existing] = await tx
          .select()
          .from(meetingDeviceRequest)
          .where(eq(meetingDeviceRequest.id, input.operationId))
          .for("update")
          .limit(1);
        if (
          existing &&
          (existing.meetingId !== input.meetingId ||
            existing.accountId !== input.userId ||
            existing.deviceId !== input.deviceId ||
            existing.epoch !== input.epoch ||
            existing.kind !== input.kind ||
            existing.requestHash !== requestHash)
        ) {
          throw new EchoProcessingError(409, "操作 ID 已绑定其他输入");
        }
        if (existing?.status === "complete") {
          return { result: z.json().parse(existing.result), state: "complete" };
        }
        if (existing?.leaseExpiresAt && existing.leaseExpiresAt.getTime() > Date.now()) {
          return { state: "busy" };
        }
        const token = randomUUID();
        const leaseExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        if (existing) {
          await tx
            .update(meetingDeviceRequest)
            .set({ attemptToken: token, leaseExpiresAt, updatedAt: new Date() })
            .where(eq(meetingDeviceRequest.id, input.operationId));
        } else {
          const [inserted] = await tx
            .insert(meetingDeviceRequest)
            .values({
              accountId: input.userId,
              attemptToken: token,
              deviceId: input.deviceId,
              epoch: input.epoch,
              id: input.operationId,
              kind: input.kind,
              leaseExpiresAt,
              meetingId: input.meetingId,
              requestHash,
            })
            .onConflictDoNothing()
            .returning({ id: meetingDeviceRequest.id });
          if (!inserted) {
            throw new EchoProcessingError(409, "操作 ID 已被其他请求使用");
          }
        }
        return { state: "claimed", token };
      }),
    complete: (input: EchoRequestInput & { token: string; result: JsonValue }) =>
      db.transaction(async (tx) => {
        await lockEchoDeviceMeeting(tx, input);
        const [updated] = await tx
          .update(meetingDeviceRequest)
          .set({
            attemptToken: null,
            leaseExpiresAt: null,
            result: input.result,
            status: "complete",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(meetingDeviceRequest.id, input.operationId),
              eq(meetingDeviceRequest.attemptToken, input.token),
            ),
          )
          .returning({ id: meetingDeviceRequest.id });
        if (!updated) {
          throw new EchoProcessingError(409, "操作已被更新的执行替代");
        }
      }),
    read: (input: EchoProcessingActor & { operationId: string; kind: string }) =>
      db.transaction(async (tx) => {
        await lockEchoDeviceMeeting(tx, input);
        const [request] = await tx
          .select()
          .from(meetingDeviceRequest)
          .where(
            and(
              eq(meetingDeviceRequest.id, input.operationId),
              eq(meetingDeviceRequest.meetingId, input.meetingId),
              eq(meetingDeviceRequest.accountId, input.userId),
              eq(meetingDeviceRequest.deviceId, input.deviceId),
              eq(meetingDeviceRequest.epoch, input.epoch),
              eq(meetingDeviceRequest.kind, input.kind),
              eq(meetingDeviceRequest.status, "complete"),
            ),
          )
          .limit(1);
        if (!request) {
          throw new EchoProcessingError(404, "设备请求尚未完成或不存在");
        }
        return z.json().parse(request.result);
      }),
    release: async (input: { operationId: string; token: string }) => {
      await db
        .update(meetingDeviceRequest)
        .set({ attemptToken: null, leaseExpiresAt: null })
        .where(
          and(
            eq(meetingDeviceRequest.id, input.operationId),
            eq(meetingDeviceRequest.attemptToken, input.token),
          ),
        );
    },
  };
}
