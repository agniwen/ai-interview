"""LiveKit RoomCompositeEgress helpers.

启动一段 RoomComposite 录像, 将房间内候选人摄像头画面 + 双方音频
合成为一个 MP4, 直接写入 Cloudflare R2 录像桶.

Starts a RoomComposite egress that records the candidate's camera plus
both-side audio into a single MP4, uploaded directly to the recording R2
bucket.
"""

import logging
import os

from livekit import api

logger = logging.getLogger("agent")


def _recording_r2_upload_from_env() -> api.S3Upload | None:
    """读取录像专用 RECORDING_R2_* 环境变量, 缺失则禁用录像.

    Read recording-specific RECORDING_R2_* env vars; disable recording when
    any required field is missing.
    """
    access_key = os.environ.get("RECORDING_R2_ACCESS_KEY_ID")
    secret = os.environ.get("RECORDING_R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("RECORDING_R2_BUCKET_NAME")
    endpoint = os.environ.get("RECORDING_R2_ENDPOINT")

    if not (access_key and secret and bucket and endpoint):
        return None

    return api.S3Upload(
        access_key=access_key,
        secret=secret,
        bucket=bucket,
        region=os.environ.get("RECORDING_R2_REGION", "auto"),
        endpoint=endpoint,
        force_path_style=os.environ.get(
            "RECORDING_R2_FORCE_PATH_STYLE", "true"
        ).lower()
        == "true",
    )


async def start_room_recording(
    lkapi: api.LiveKitAPI,
    room_name: str,
    file_key: str,
) -> api.EgressInfo | None:
    """启动 RoomCompositeEgress. 失败时记录日志并返回 None, 不阻塞面试主流程.

    Start a RoomCompositeEgress; on failure, log and return None so the
    interview itself is unaffected.
    """
    s3 = _recording_r2_upload_from_env()
    if s3 is None:
        logger.info("recording skipped: RECORDING_R2 env vars not configured")
        return None

    request = api.RoomCompositeEgressRequest(
        room_name=room_name,
        layout="speaker",
        audio_only=False,
        file_outputs=[
            api.EncodedFileOutput(
                file_type=api.EncodedFileType.MP4,
                filepath=file_key,
                s3=s3,
            )
        ],
    )

    try:
        info = await lkapi.egress.start_room_composite_egress(request)
        logger.info(
            "recording started: egress_id=%s filepath=%s",
            info.egress_id,
            file_key,
        )
        return info
    except Exception:
        logger.exception("failed to start room composite egress")
        return None


async def stop_recording(
    lkapi: api.LiveKitAPI, egress_id: str
) -> api.EgressInfo | None:
    """显式停止 egress. 若已自然结束会抛错, 吞掉后从 list 接口拉最终态.

    Explicitly stop the egress; if it has already ended naturally, swallow the
    error and fetch the final state via list_egress.
    """
    try:
        return await lkapi.egress.stop_egress(
            api.StopEgressRequest(egress_id=egress_id)
        )
    except Exception:
        logger.debug("stop_egress raised (likely already ended)", exc_info=True)
        try:
            res = await lkapi.egress.list_egress(
                api.ListEgressRequest(egress_id=egress_id)
            )
            if res.items:
                return res.items[0]
        except Exception:
            logger.exception("list_egress fallback failed")
        return None


def egress_status_to_str(info: api.EgressInfo | None) -> str:
    """把 EgressStatus 枚举映射成上报接口需要的字符串.

    Map the EgressStatus enum to the string variants expected by the report API.
    """
    if info is None:
        return "failed"
    status = info.status
    if status in (api.EGRESS_COMPLETE,):
        return "completed"
    if status in (api.EGRESS_ABORTED, api.EGRESS_FAILED, api.EGRESS_LIMIT_REACHED):
        return "failed"
    if status in (api.EGRESS_STARTING, api.EGRESS_ACTIVE, api.EGRESS_ENDING):
        return "active"
    return "pending"


def egress_duration_secs(info: api.EgressInfo | None) -> int | None:
    """从 EgressInfo 推算录制时长 (秒), ended_at - started_at.

    Derive the recording duration in seconds from EgressInfo timestamps.
    """
    if info is None:
        return None
    started_ns = info.started_at or 0
    ended_ns = info.ended_at or 0
    if started_ns <= 0 or ended_ns <= 0 or ended_ns < started_ns:
        return None
    return int((ended_ns - started_ns) / 1_000_000_000)
