import json

import pytest

from human_transcription.contract import parse_human_job, route_job


def payload(**changes):
    data = {
        "schemaVersion": 1,
        "kind": "human_interview_transcription",
        "organizationId": "org",
        "meetingId": "meeting",
        "runId": "run",
        "generation": 1,
        "roomName": "human_meeting_abc",
    }
    return json.dumps(data | changes)


def test_human_job_requires_bound_room():
    job = parse_human_job(payload(), "human_meeting_abc")
    assert job.run_id == "run"
    with pytest.raises(ValueError):
        parse_human_job(payload(), "human_other")


@pytest.mark.parametrize(
    "changes",
    [
        {"generation": 0},
        {"generation": True},
        {"schemaVersion": 2},
        {"organizationId": ""},
        {"kind": "unknown"},
    ],
)
def test_invalid_job_is_rejected(changes):
    with pytest.raises(ValueError):
        parse_human_job(payload(**changes), "human_meeting_abc")


def test_route_does_not_start_ai_for_untrusted_human_room():
    assert route_job("", "ai_room") == "ai"
    assert route_job(payload(), "human_meeting_abc") == "human"
    with pytest.raises(ValueError):
        route_job("", "human_meeting_abc")
    with pytest.raises(ValueError):
        route_job('{"kind":"unknown"}', "ai_room")
