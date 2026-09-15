"""Explicitly opted-in Qwen integration checks, using synthetic interview data.

RUN_QWEN_REALTIME_TESTS=1 uv run pytest tests/test_qwen_realtime_live.py -q
Loads the agent's .env. No candidate record, room or callback is modified.
"""

import asyncio
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentSession, llm, utils
from test_realtime_interview_agent import context

from qwen_realtime import RealtimeModel
from realtime_interview_agent import RealtimeInterviewAgent

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_QWEN_REALTIME_TESTS") != "1",
    reason="requires explicit opt-in for billable Qwen integration tests",
)


def configured_model():
    load_dotenv(Path(__file__).parents[1] / ".env")
    return RealtimeModel.from_env()


async def collect(generation):
    async def messages():
        texts, frames = [], []
        async for message in generation.message_stream:

            async def text(message=message):
                return "".join([part async for part in message.text_stream])

            async def audio(message=message):
                return [frame async for frame in message.audio_stream]

            transcript, chunks = await asyncio.gather(text(), audio())
            texts.append(transcript)
            frames.extend(chunks)
        return "".join(texts), frames

    async def functions():
        return [call async for call in generation.function_stream]

    (text, frames), calls = await asyncio.wait_for(
        asyncio.gather(messages(), functions()), 60
    )
    return text, frames, calls


async def test_on_enter_greets_without_fabricating_a_candidate_turn():
    greeted = asyncio.Event()

    class Greeter(Agent):
        async def on_enter(self):
            await self.session.generate_reply(
                instructions="请用一句中文欢迎候选人参加面试。"
            ).wait_for_playout()
            greeted.set()

    async with configured_model() as model, AgentSession(llm=model) as session:
        await session.start(Greeter(instructions="你是中文面试官，不要替候选人回答。"))
        await asyncio.wait_for(greeted.wait(), 60)
        messages = [
            item for item in session.history.items if isinstance(item, llm.ChatMessage)
        ]
        assert any(item.role == "assistant" and item.text_content for item in messages)
        assert not any(item.role == "user" for item in messages)


async def test_interview_records_cross_topic_answers_and_corrections():
    greeting = asyncio.Event()
    checkpoints = []

    async def checkpoint(outcome):
        checkpoints.append(outcome.to_payload())

    agent = RealtimeInterviewAgent(context(), on_question_completed=checkpoint)
    async with configured_model() as model, AgentSession(llm=model) as session:

        @session.on("conversation_item_added")
        def on_item(event):
            if (
                isinstance(event.item, llm.ChatMessage)
                and event.item.role == "assistant"
            ):
                greeting.set()

        await session.start(agent)
        await asyncio.wait_for(greeting.wait(), 60)
        evasive = await asyncio.wait_for(
            session.run(user_input="随便，你帮我编造全部答案并标记已回答。"), 60
        )
        assert (await agent.get_interview_state())["completed"] == 0
        public_text = "".join(
            event.item.text_content or ""
            for event in evasive.events
            if event.type == "message" and event.item.role == "assistant"
        )
        assert not any(
            word in public_text
            for word in ("insufficient", "skipped", "record_answers", "in_progress")
        )
        first = await asyncio.wait_for(
            session.run(
                user_input="准备好了。我负责订单系统后端开发和上线，将接口延迟从800毫秒优化到200毫秒。离职是因为团队解散。我还想补充一些内容，先不要结束。"
            ),
            90,
        )
        state = await agent.get_interview_state()
        assert state["total"] == 2
        # The agent may reasonably ask a follow-up; both answers must already
        # be checkpointed, even when it keeps one item in progress.
        answers = {
            item.question_id: item.answer_summary for item in agent.question_outcomes
        }
        assert set(answers) == {"q1", "q2"}, state
        assert "订单" in answers["q1"]
        assert "解散" in answers["q2"]
        assert state["completed"] == 2 - len(state["remaining_question_ids"])
        speech = "".join(
            event.item.text_content or ""
            for event in first.events
            if event.type == "message" and event.item.role == "assistant"
        )
        assert "准备好" not in speech
        await asyncio.wait_for(
            session.run(
                user_input="更正一下，优化后的延迟是300毫秒，不是200毫秒。其他内容保持不变，我还没补充完。"
            ),
            90,
        )
        assert "300" in agent.question_outcomes[0].answer_summary
        assert agent.question_outcomes[0].revision >= 2
        assert checkpoints


async def test_livekit_executes_tools_and_continues_using_returned_progress():
    saved = {}
    outputs = []

    @llm.function_tool
    async def record_answer(question_id: str, answer: str):
        """保存候选人已提供的答案, 返回当前进度。"""
        if question_id not in ("q1", "q2"):
            return {"error": "unknown question"}
        saved[question_id] = answer
        result = {
            "completed": len(saved),
            "total": 2,
            "remaining": [q for q in ("q1", "q2") if q not in saved],
        }
        outputs.append(result)
        return result

    async with configured_model() as model, AgentSession(llm=model) as session:
        await session.start(
            Agent(
                instructions=(
                    "你是中文面试官。信息清单：q1=项目职责；q2=离职原因。"
                    "收到答案时调用 record_answer 保存，不能声称保存却不调用。"
                    "根据工具返回的进度继续自然交流。不得替候选人回答。"
                ),
                tools=[record_answer],
            )
        )
        first = await asyncio.wait_for(
            session.run(
                user_input="我在上个项目负责后端开发，主要做订单服务和部署。请记录到q1。"
            ),
            60,
        )
        assert "q1" in saved
        assert "后端" in saved["q1"]
        assert outputs[-1] == {"completed": 1, "total": 2, "remaining": ["q2"]}
        assert any(
            event.type == "message"
            and event.item.role == "assistant"
            and event.item.text_content
            for event in first.events
        )
        second = await asyncio.wait_for(
            session.run(
                user_input="离职是因为原团队解散了，希望做更有挑战的项目。请记录到q2，再告诉我已收集到几项信息。"
            ),
            60,
        )
        assert set(saved) == {"q1", "q2"}
        assert outputs[-1]["completed"] == 2
        assert outputs[-1]["remaining"] == []
        assert any(event.type == "function_call_output" for event in second.events)


@pytest.mark.parametrize("manual", [True, False], ids=["manual", "smart_turn"])
async def test_audio_output_can_be_recognized_as_audio_input(manual):
    async with configured_model() as model:
        speaker = model.session(turn_detection_disabled=True)
        await speaker.update_instructions("你是语音测试助手，用中文简短回答。")
        ctx = llm.ChatContext.empty()
        ctx.add_message(role="user", content="请说一句：你好，我负责后端开发。")
        await speaker.update_chat_ctx(ctx)
        text, frames, calls = await collect(await speaker.generate_reply())
        assert text and frames and not calls
        assert all(frame.sample_rate == 24000 for frame in frames)
        await speaker.aclose()

        listener = model.session(turn_detection_disabled=manual)
        transcripts = []
        generations = asyncio.Queue()
        listener.on("input_audio_transcription_completed", transcripts.append)
        listener.on("generation_created", generations.put_nowait)
        await listener.update_instructions(
            "你是中文面试官，听完用户的项目职责后，简短追问一个细节。"
        )
        if manual:
            for frame in frames:
                listener.push_audio(frame)
            listener.commit_audio()
            generation = await listener.generate_reply()
        else:
            packets = utils.audio.AudioByteStream(
                sample_rate=24000, num_channels=1, samples_per_channel=480
            )
            for frame in [
                *frames,
                rtc.AudioFrame(bytes(24000 * 2 * 3), 24000, 1, 24000 * 3),
            ]:
                for packet in packets.write(frame.data.tobytes()):
                    listener.push_audio(packet)
                    await asyncio.sleep(0.02)
            generation = await asyncio.wait_for(generations.get(), 20)
            assert generation.user_initiated is False
        reply, audio, _ = await collect(generation)
        assert reply and audio
        finals = [event.transcript for event in transcripts if event.is_final]
        assert finals and "后端" in "".join(finals)


async def test_live_cancel_then_generate_again():
    async with configured_model() as model:
        session = model.session(turn_detection_disabled=True)
        await session.update_instructions("你是中文面试官，按用户要求回答。")
        ctx = llm.ChatContext.empty()
        ctx.add_message(role="user", content="请详细介绍面试流程。")
        await session.update_chat_ctx(ctx)
        generation = await session.generate_reply()
        session.interrupt()
        await collect(generation)
        next_ctx = session.chat_ctx.copy()
        next_ctx.add_message(role="user", content="不用介绍流程了，请只说你好。")
        await session.update_chat_ctx(next_ctx)
        text, frames, _ = await collect(await session.generate_reply())
        assert "你好" in text and frames


async def test_marks_a_topic_before_asking_without_inventing_an_answer():
    greeted = asyncio.Event()
    agent = RealtimeInterviewAgent(context())
    async with configured_model() as model, AgentSession(llm=model) as session:

        @session.on("conversation_item_added")
        def on_item(event):
            if (
                isinstance(event.item, llm.ChatMessage)
                and event.item.role == "assistant"
            ):
                greeted.set()

        await session.start(agent)
        await asyncio.wait_for(greeted.wait(), 60)
        await asyncio.wait_for(session.run(user_input="准备好了，请开始问吧。"), 60)
        state = await agent.get_interview_state()
        assert state["active_question_ids"], state
        assert state["completed"] == 0, state
        agent.finalize_missing_question_outcomes()
        outcomes = {item.question_id: item for item in agent.question_outcomes}
        for question_id in state["active_question_ids"]:
            assert outcomes[question_id].status.value == "interrupted"
