import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createMeetingNote,
  deleteMeetingNote,
  desktopMeetingKeys,
  fetchMeetingNotes,
  updateMeetingNote,
} from "@/lib/client/meetings";

export function canCreateMeetingNotes(role: MeetingAccessRole): boolean {
  return role !== "viewer";
}

function formatNoteTime(meetingTimeMs: number): string {
  const seconds = Math.floor(meetingTimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MeetingNotesPanel({
  accessRole,
  meetingId,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [meetingTimeSeconds, setMeetingTimeSeconds] = useState(0);
  const [editingBody, setEditingBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const notesKey = desktopMeetingKeys.notes(slug, meetingId);
  const notesQuery = useQuery({
    queryFn: () => fetchMeetingNotes(slug, meetingId),
    queryKey: notesKey,
  });
  const refreshNotes = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: notesKey }),
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.searchRoot(slug) }),
    ]);
  const createMutation = useMutation({
    mutationFn: () =>
      createMeetingNote(slug, meetingId, {
        body,
        meetingTimeMs: Math.max(0, Math.round(meetingTimeSeconds * 1000)),
      }),
    onSuccess: async () => {
      setBody("");
      await refreshNotes();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ noteId }: { noteId: string }) =>
      updateMeetingNote(slug, meetingId, noteId, { body: editingBody }),
    onSuccess: async () => {
      setEditingId(null);
      await refreshNotes();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteMeetingNote(slug, meetingId, noteId),
    onSuccess: refreshNotes,
  });

  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) {
      createMutation.mutate();
    }
  }

  const error =
    notesQuery.error ?? createMutation.error ?? updateMutation.error ?? deleteMutation.error;
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4">
        <h2 className="font-medium">Meeting Notes</h2>
        <p className="text-muted-foreground text-xs">
          协作记录会保留作者与会议时间，不会修改转录内容。
        </p>
      </div>
      {error ? (
        <p className="mb-3 text-destructive text-sm">
          {error instanceof Error ? error.message : "Meeting Notes 操作失败"}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {(notesQuery.data ?? []).map((note) => (
          <article className="rounded-lg border p-3" key={note.id}>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Button
                  render={
                    <Link
                      params={{ meetingId }}
                      search={{ at: note.meetingTimeMs / 1000 }}
                      to="/meetings/$meetingId"
                    />
                  }
                  size="sm"
                  variant="outline"
                >
                  {formatNoteTime(note.meetingTimeMs)}
                </Button>
                <span className="text-muted-foreground">{note.author.name}</span>
              </div>
              <span className="text-muted-foreground">
                {new Date(note.updatedAt).toLocaleString("zh-CN")}
              </span>
            </div>
            {editingId === note.id ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  onChange={(event) => setEditingBody(event.target.value)}
                  value={editingBody}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={!editingBody.trim() || updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ noteId: note.id })}
                    size="sm"
                  >
                    保存
                  </Button>
                  <Button onClick={() => setEditingId(null)} size="sm" variant="ghost">
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
            )}
            {editingId !== note.id && (note.canEdit || note.canDelete) ? (
              <div className="mt-2 flex gap-2">
                {note.canEdit ? (
                  <Button
                    onClick={() => {
                      setEditingBody(note.body);
                      setEditingId(note.id);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    编辑
                  </Button>
                ) : null}
                {note.canDelete ? (
                  <Button
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(note.id)}
                    size="sm"
                    variant="ghost"
                  >
                    删除
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
        {notesQuery.isPending ? (
          <p className="text-muted-foreground text-sm">正在加载 Meeting Notes…</p>
        ) : null}
        {!notesQuery.isPending && notesQuery.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">还没有 Meeting Note。</p>
        ) : null}
      </div>
      {canCreateMeetingNotes(accessRole) ? (
        <form className="mt-4 flex flex-col gap-2 border-t pt-4" onSubmit={submitNote}>
          <label className="flex items-center gap-2 text-sm" htmlFor="meeting-note-time">
            <span>会议时间（秒）</span>
            <Input
              className="w-28"
              id="meeting-note-time"
              min={0}
              onChange={(event) => setMeetingTimeSeconds(event.target.valueAsNumber || 0)}
              type="number"
              value={meetingTimeSeconds}
            />
          </label>
          <Textarea
            onChange={(event) => setBody(event.target.value)}
            placeholder="记录决定、待办或上下文…"
            value={body}
          />
          <Button
            className="self-start"
            disabled={!body.trim() || createMutation.isPending}
            type="submit"
          >
            {createMutation.isPending ? "正在添加…" : "添加 Meeting Note"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
