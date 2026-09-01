import { zValidator } from "@hono/zod-validator";
import { createMeetingNoteSchema, updateMeetingNoteSchema } from "@arc/shared/meeting-recording";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  addMeetingNote,
  editMeetingNote,
  getMeetingNotes,
  removeMeetingNote,
} from "../../collaboration-service";

export const meetingNotesRouter = factory
  .createApp()
  .get("/", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const records = await getMeetingNotes({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    return records ? c.json({ records }, 200) : c.json({ error: "Meeting Session 不存在" }, 404);
  })
  .post(
    "/",
    zValidator("json", createMeetingNoteSchema, jsonValidatorError("Meeting Note 无效")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const result = await addMeetingNote({
        meetingId,
        memberRole: member.role,
        note: c.req.valid("json"),
        organizationId: activeOrg.id,
        userId: user.id,
        userName: user.name,
      });
      if (result === null) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      if (result === "forbidden") {
        return c.json({ error: "无权创建 Meeting Note" }, 403);
      }
      if (result === "invalid-time") {
        return c.json({ error: "Meeting Note 时间超出录音时长" }, 400);
      }
      if (result === "limit-exceeded") {
        return c.json({ error: "Meeting Note 数量或总文字长度已达到上限" }, 409);
      }
      return c.json(result, 201);
    },
  )
  .patch(
    "/:noteId",
    zValidator("json", updateMeetingNoteSchema, jsonValidatorError("Meeting Note 无效")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const result = await editMeetingNote({
        meetingId,
        memberRole: member.role,
        note: c.req.valid("json"),
        noteId: c.req.param("noteId"),
        organizationId: activeOrg.id,
        userId: user.id,
      });
      if (result === null) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      if (result === "forbidden") {
        return c.json({ error: "只能修改自己的 Meeting Note" }, 403);
      }
      if (result === "invalid-time") {
        return c.json({ error: "Meeting Note 时间超出录音时长" }, 400);
      }
      if (result === "limit-exceeded") {
        return c.json({ error: "Meeting Note 数量或总文字长度已达到上限" }, 409);
      }
      return c.json(result, 200);
    },
  )
  .delete("/:noteId", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await removeMeetingNote({
      meetingId,
      memberRole: member.role,
      noteId: c.req.param("noteId"),
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (result === null) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    return result === "deleted"
      ? c.body(null, 204)
      : c.json({ error: "只能删除自己的 Meeting Note" }, 403);
  });
