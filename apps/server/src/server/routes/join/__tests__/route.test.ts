import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../lib/server/db/index";
import { member, organization, workspaceInviteLink } from "@arc/db-schema/schema";
import { factory } from "../../../factory";
import { joinRouter } from "../route";

const app = factory.createApp().route("/join", joinRouter);
const client = testClient(app);

const ORG = "test_join_route_org";

async function clean() {
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(workspaceInviteLink).where(eq(workspaceInviteLink.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
}

describe("/join route", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORG,
      name: "Test",
      slug: "test-join-route",
    });
    await db.insert(workspaceInviteLink).values({
      code: "ROUTECODE1234567",
      createdBy: null,
      id: "wil_route",
      organizationId: ORG,
    });
  });
  afterEach(clean);

  it("GET /:code/preview returns valid=true for active link", async () => {
    const res = await client.join[":code"].preview.$get({
      param: { code: "ROUTECODE1234567" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it("GET /:code/preview returns valid=false for unknown code", async () => {
    const res = await client.join[":code"].preview.$get({
      param: { code: "UNKNOWNCODE12345" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("POST /:code/accept returns 401 when not authenticated", async () => {
    const res = await client.join[":code"].accept.$post({
      param: { code: "ROUTECODE1234567" },
    });
    expect(res.status).toBe(401);
  });
});
