import json
from dataclasses import dataclass


@dataclass(frozen=True)
class HumanJob:
    organization_id: str
    meeting_id: str
    run_id: str
    generation: int
    room_name: str

    def payload(self) -> dict:
        return {
            "schemaVersion": 1,
            "kind": "human_interview_transcription",
            "organizationId": self.organization_id,
            "meetingId": self.meeting_id,
            "runId": self.run_id,
            "generation": self.generation,
            "roomName": self.room_name,
        }


def parse_human_job(raw: str, room_name: str) -> HumanJob:
    data = json.loads(raw)
    if (
        not isinstance(data, dict)
        or (
            type(data.get("schemaVersion")) is not int or data.get("schemaVersion") != 1
        )
        or data.get("kind") != "human_interview_transcription"
    ):
        raise ValueError("invalid human transcription contract")
    for key in ("organizationId", "meetingId", "runId", "roomName"):
        if (
            not isinstance(data.get(key), str)
            or not data[key].strip()
            or len(data[key]) > 256
        ):
            raise ValueError(f"invalid {key}")
    generation = data.get("generation")
    if type(generation) is not int or generation < 1:
        raise ValueError("invalid generation")
    if data["roomName"] != room_name or not room_name.startswith("human_"):
        raise ValueError("room binding mismatch")
    return HumanJob(
        data["organizationId"], data["meetingId"], data["runId"], generation, room_name
    )


def route_job(raw: str, room_name: str) -> str:
    if room_name.startswith("human_"):
        parse_human_job(raw, room_name)
        return "human"
    if raw:
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get("kind") not in (None, "ai_interview"):
            raise ValueError("unknown job kind")
    return "ai"
