import json

import pytest

from dispatch_context import DispatchContextError, parse_dispatch_context


def _payload(**overrides):
    payload = {
        "schemaVersion": 3,
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
        "questions": [
            {
                "id": "question-1",
                "content": "请介绍一次故障排查经历。",
                "difficulty": "medium",
                "evaluationFocus": "确认候选人能够定位并复盘线上故障",
                "followUpDirections": "追问定位信号、根因与预防措施",
                "followUpContract": {
                    "coverageMode": "sufficient_for_evaluation",
                    "facets": [
                        {
                            "id": "facet-root-cause",
                            "label": "故障根因",
                            "sourceField": "follow_up_directions",
                            "sourceText": "根因",
                        }
                    ],
                    "schemaVersion": 1,
                },
            }
        ],
    }
    payload.update(overrides)
    return payload


def test_parses_versioned_dispatch_context_into_typed_fields():
    context = parse_dispatch_context(json.dumps(_payload(), ensure_ascii=False))

    assert context.schema_version == 3
    assert context.session.interview_record_id == "record-1"
    assert context.candidate.name == "郭靖"
    assert context.recording.file_key == "recordings/room-1.mp4"
    assert context.selected_interviewer is not None
    assert context.selected_interviewer.voice == "voice-b"
    assert context.prompts.system == "最终系统提示词"
    assert context.questions[0].id == "question-1"
    assert context.questions[0].evaluation_focus == "确认候选人能够定位并复盘线上故障"
    assert context.questions[0].follow_up_directions == "追问定位信号、根因与预防措施"
    assert context.questions[0].follow_up_contract is not None
    assert context.questions[0].follow_up_contract.facets[0].label == "故障根因"


@pytest.mark.parametrize(
    "payload",
    [
        {"candidate_name": "旧格式"},
        _payload(schemaVersion=1),
        _payload(questions=[]),
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
