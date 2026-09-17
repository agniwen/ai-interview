import { describe, expect, it } from "vitest";
import type { PgTable } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  recruitingRecord,
  recruitingNodeState,
  recruitingOffer,
  recruitingEvent,
} from "@app/db-schema/schema";
import { reopenRecruitingRecordTx, transitionRecruitingNodeTx } from "./recruiting-pipeline";

type Row = Partial<
  Omit<typeof recruitingRecord.$inferSelect, "status"> &
    Omit<typeof recruitingNodeState.$inferSelect, "status"> &
    Omit<typeof recruitingOffer.$inferSelect, "status"> &
    typeof recruitingEvent.$inferSelect
> & { status?: string };
function fixture(
  status: string,
  stage: typeof recruitingRecord.$inferSelect.currentStage = "offer",
) {
  const now = new Date("2026-09-16T08:00:00Z");
  const record: Row = {
    currentStage: stage,
    id: "record",
    organizationId: "org",
    outcome: "in_pipeline",
    version: 1,
  };
  const nodes: Row[] = (
    ["screening", "salary_negotiation", "offer", "background_check"] as const
  ).map((node) => ({
    effectiveOfferId: node === "offer" ? "old-offer" : null,
    enteredAt: now,
    node,
    result: "pass",
    status: "completed",
  }));
  const offer: Row = {
    id: "old-offer",
    publicToken: "old-token",
    responseAt: status === "accepted" ? now : null,
    status,
    version: 1,
  };
  const events: Row[] = [];
  const selects: string[] = [];
  const tx = {
    insert(table: PgTable) {
      return {
        values(value: Row) {
          if (table === recruitingEvent) {
            events.push(value);
          }
          return Object.assign(Promise.resolve(), {
            onConflictDoUpdate() {
              const existing = nodes.find((node) => node.node === value.node);
              if (existing) {
                Object.assign(existing, value);
              } else {
                nodes.push(value);
              }
              return Promise.resolve();
            },
          });
        },
      };
    },
    select() {
      return {
        from(table: PgTable) {
          return {
            where(condition: SQL) {
              const query = new PgDialect().sqlToQuery(condition);
              selects.push(query.sql);
              let rows: Row[] = [];
              if (table === recruitingRecord) {
                rows = [record];
              }
              if (table === recruitingNodeState) {
                rows = nodes;
              }
              if (table === recruitingOffer) {
                rows =
                  query.params.includes("superseded") && offer.status === "superseded"
                    ? []
                    : [offer];
              }
              const promise = Promise.resolve(rows.map((row) => ({ ...row })));
              return Object.assign(promise, { for: () => promise, limit: () => promise });
            },
          };
        },
      };
    },
    update(table: PgTable) {
      return {
        set(patch: Row) {
          return {
            where() {
              if (table === recruitingRecord) {
                Object.assign(record, patch);
              }
              if (table === recruitingOffer) {
                Object.assign(offer, patch);
              }
              return Object.assign(Promise.resolve(), {
                returning: () => Promise.resolve([{ ...record }]),
              });
            },
          };
        },
      };
    },
  };
  // SAFETY: In-memory transaction implements only the DB calls exercised by these commands.
  return {
    command: { now, operatorId: null, organizationId: "org", recordId: "record" },
    events,
    nodes,
    offer,
    selects,
    tx: tx as never,
  };
}

describe("Offer 回退失效", () => {
  it.each(["sent", "accepted"])("旧 %s Offer 在回退后不恢复为当前进度", async (status) => {
    const f = fixture(status);
    await reopenRecruitingRecordTx(f.tx, {
      ...f.command,
      reason: "重新谈薪",
      targetNode: "salary_negotiation",
    });
    expect(f.offer).toMatchObject({ publicToken: "old-token", status: "superseded" });
    expect(f.events[0]?.detail).toMatchObject({
      invalidatedOffers: [{ id: "old-offer", status, version: 1 }],
    });
    const salary = f.nodes.find((node) => node.node === "salary_negotiation");
    if (!salary) {
      throw new Error("missing salary node");
    }
    Object.assign(salary, { result: "pass", status: "completed" });
    await transitionRecruitingNodeTx(f.tx, { ...f.command, targetNode: "offer" });
    expect(f.nodes.find((node) => node.node === "offer")).toMatchObject({
      effectiveOfferId: null,
      result: null,
      status: "awaiting_send",
    });
    expect(f.selects.some((sql) => sql.includes('"recruiting_offer"."status" <>'))).toBe(true);
  });
  it("直接回到 Offer 也失效旧记录，并保留旧响应时间", async () => {
    const f = fixture("accepted", "background_check");
    const { responseAt } = f.offer;
    await reopenRecruitingRecordTx(f.tx, { ...f.command, reason: "重发条款", targetNode: "offer" });
    expect(f.offer).toMatchObject({ responseAt, status: "superseded" });
    expect(f.nodes.find((node) => node.node === "offer")).toMatchObject({
      effectiveOfferId: null,
      status: "pending",
    });
  });
  it("仅回到背调时保留已接受的 Offer", async () => {
    const f = fixture("accepted", "background_check");
    await reopenRecruitingRecordTx(f.tx, {
      ...f.command,
      reason: "复核背调",
      targetNode: "background_check",
    });
    expect(f.offer.status).toBe("accepted");
    expect(f.nodes.find((node) => node.node === "offer")?.effectiveOfferId).toBe("old-offer");
  });
});
