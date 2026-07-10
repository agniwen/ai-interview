import json

import pytest

from dispatch_context import DispatchContextError, parse_dispatch_context


def _payload(**overrides):
    payload = {
        "schemaVersion": 1,
        "session": {
            "allowTextInput": True,
            "interviewRecordId": "record-1",
            "roundId": "round-1",
        },
        "candidate": {"name": "郭靖", "targetRole": "后端工程师"},
        "recording": {
            "enabled": True,
            "fileKey": "recordings/room-1.mp4",
        },
        "selectedInterviewer": {
            "name": "面试官乙",
            "voice": "voice-b",
        },
        "prompts": {
            "system": "最终系统提示词",
            "opening": "你好郭靖",
            "closing": "再见郭靖",
        },
    }
    payload.update(overrides)
    return payload


def test_parses_versioned_dispatch_context_into_typed_fields():
    context = parse_dispatch_context(json.dumps(_payload(), ensure_ascii=False))

    assert context.schema_version == 1
    assert context.session.interview_record_id == "record-1"
    assert context.candidate.name == "郭靖"
    assert context.recording.file_key == "recordings/room-1.mp4"
    assert context.selected_interviewer is not None
    assert context.selected_interviewer.voice == "voice-b"
    assert context.prompts.system == "最终系统提示词"


def test_accepts_known_legacy_fields_during_backend_first_rollout():
    payload = _payload(
        allow_text_input=True,
        candidate_name="郭靖",
        interview_record_id="record-1",
        interviewers=[{"name": "面试官乙", "voice": "voice-b"}],
        round_id="round-1",
    )

    context = parse_dispatch_context(json.dumps(payload, ensure_ascii=False))

    assert context.schema_version == 1
    assert context.selected_interviewer is not None
    assert context.selected_interviewer.name == "面试官乙"


@pytest.mark.parametrize(
    "payload",
    [
        {"candidate_name": "旧格式"},
        _payload(schemaVersion=2),
        _payload(prompts={"system": "缺少开场和结束语"}),
        _payload(recording={"enabled": "yes", "fileKey": None}),
        _payload(unexpected=True),
    ],
)
def test_rejects_legacy_incomplete_or_wrongly_typed_metadata(payload):
    with pytest.raises(DispatchContextError):
        parse_dispatch_context(json.dumps(payload, ensure_ascii=False))


def test_rejects_invalid_json():
    with pytest.raises(DispatchContextError):
        parse_dispatch_context("not-json")
