import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class EventOutbox:
    """Bounded local spool; acknowledged events alone may be removed."""

    def __init__(self, path: Path, capacity: int = 10000):
        if capacity < 1:
            raise ValueError("capacity must be positive")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.capacity = capacity
        with self.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, body TEXT NOT NULL)"
            )

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def append(self, event: dict):
        body = json.dumps(event, ensure_ascii=False, sort_keys=True)
        with self.connection() as db:
            previous = db.execute(
                "SELECT body FROM events WHERE id = ?", (event["eventId"],)
            ).fetchone()
            if previous:
                if previous[0] != body:
                    raise ValueError("event identity conflict")
                return
            if db.execute("SELECT COUNT(*) FROM events").fetchone()[0] >= self.capacity:
                raise OverflowError("transcription outbox full")
            db.execute("INSERT INTO events VALUES (?, ?)", (event["eventId"], body))

    def pending(self, limit: int = 100):
        with self.connection() as db:
            return [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT body FROM events ORDER BY rowid LIMIT ?", (limit,)
                )
            ]

    def ack(self, ids: list[str]):
        with self.connection() as db:
            db.executemany(
                "DELETE FROM events WHERE id = ?", [(value,) for value in ids]
            )

    def set_metadata(self, envelope: dict):
        with self.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY, body TEXT NOT NULL)"
            )
            db.execute(
                "INSERT OR REPLACE INTO metadata VALUES (1, ?)", (json.dumps(envelope),)
            )

    def metadata(self):
        with self.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY, body TEXT NOT NULL)"
            )
            row = db.execute("SELECT body FROM metadata WHERE id=1").fetchone()
            return json.loads(row[0]) if row else None


async def replay_transcription_outboxes(client, base_url: str, secret: str):
    import os

    directory = Path(
        os.environ.get("HUMAN_TRANSCRIPTION_OUTBOX_DIR", ".data/human-transcription")
    )
    import time

    processed = 0
    for path in sorted(directory.glob("*.sqlite")):
        box = EventOutbox(path)
        envelope = box.metadata()
        if not envelope or envelope["baseUrl"] != base_url.rstrip("/"):
            continue
        if envelope.get("acknowledged"):
            if time.time() - path.stat().st_mtime > 86400:
                path.unlink(missing_ok=True)
            continue
        if envelope.get("fenced"):
            continue
        if processed >= 100:
            break
        processed += 1
        events = box.pending()
        if not events and not envelope.get("finished"):
            continue
        if events:
            response = await client.post(
                f"{base_url.rstrip('/')}/api/agent/human-transcription/events",
                json={**envelope["payload"], "events": events},
                headers={"X-Agent-Secret": secret},
            )
            if response.status_code == 409:
                box.set_metadata({**envelope, "fenced": True})
                continue
            if response.is_success:
                box.ack(response.json()["acknowledgedIds"])
        if envelope.get("finished") and not box.pending():
            response = await client.post(
                f"{base_url.rstrip('/')}/api/agent/human-transcription/finish",
                json={**envelope["payload"], "error": envelope.get("error")},
                headers={"X-Agent-Secret": secret},
            )
            if response.is_success:
                box.set_metadata({**envelope, "finished": False, "acknowledged": True})
