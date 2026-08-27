# Real-time voice coach

ForgeFit now has an optional low-latency native-audio session in addition to
text chat and composer dictation. Its interaction model follows the useful parts
of Vapi's web-call UX: explicit call lifecycle, visible listening/speaking state,
one current utterance, interruption, and tool-backed application context. The
call surface uses a lightweight 3D-rendered human coach stage rather than chat
bubbles or an abstract assistant orb.

## Implemented locally

- `POST /v1/coach/live-token` provisions a one-use, 30-minute Gemini Live token
  for the authenticated member and current coach thread.
- `GET /v1/coach/live-snapshot` returns a redacted profile, current plan,
  readiness, active-session sets, recent sessions, and compact movement data.
- The lazily loaded browser client sends 16 kHz mono PCM over a raw WebSocket,
  receives native PCM audio, clears queued playback on interruption, and closes
  microphone, audio, and network resources on stop or backgrounding.
- Completed user and coach transcripts are saved through
  `POST /v1/coach/live-turns` into the same ongoing text thread.
- Each new socket is seeded with a bounded chronological window from that
  ongoing thread. Context-window compression and Gemini session-resumption
  handles keep context across provider connection rotations.
- The workout screen can open the same live coach while MediaPipe tracks a
  supported movement locally. Corrective and periodic rep summaries are sent
  as compact text signals; raw frames and landmarks remain in the browser.
- The live surface presents one active speaker at a time around a 75 KB
  transparent WebP coach asset. Listening, speaking, connecting, and reduced-
  motion states are handled in CSS without a WebGL runtime.
- Browser `speechSynthesis` is no longer presented as a voice-agent feature.

## Recommended architecture

```text
Authenticated browser
  |-- POST /api/backend/coach/live-token
  |     -> authenticated backend creates a one-use, short-lived Gemini token
  |
  |-- audio (only while the live session is explicitly active)
  |     -> direct WebSocket to Gemini Live using the ephemeral token
  |
  |-- authenticated tool request: get_live_workout_snapshot
  |     -> same-origin backend proxy
  |     -> active workout, logged sets, and compact movement aggregates
  |     <- no camera frames, landmark arrays, or free-form health records
  |
  |-- on-device movement signal (corrective or every third rep)
  |     -> exercise, rep, duration, ROM, confidence, and local cue only
  |
  `-- streamed audio response + visible transcript
```

The browser-to-Gemini connection avoids routing high-frequency PCM audio
through the application containers. The permanent `GEMINI_API_KEY` stays in the
backend. The backend provisions one-use ephemeral tokens constrained to the
reviewed model, native-audio response modality, and personalized instruction;
the instruction stays inside the server-created token constraint.

## Real-time workout data

Expose one read-only function to the live model:

```text
get_live_workout_snapshot()
```

The browser handles the tool call by requesting an authenticated snapshot from
ForgeFit. The response should contain only:

- active session ID, name, state, and elapsed active time;
- current exercises and prescribed work;
- logged set counts, reps, load, and effort;
- recent captured-rep count plus aggregate duration, confidence, and
  range-of-motion by exercise;
- an explicit timestamp so the model describes the data as a snapshot.

Do not expose raw camera frames, pose landmarks, pending database documents,
internal user IDs, API credentials, or unrestricted backend URLs as tool data.
The model requests data; application code validates and executes every tool.

## Safety gate

Direct native-audio conversation can begin producing output before a final
transcript is available. That conflicts with the existing rule that deterministic
urgent-symptom and pain checks run before every eligible coach model call.

Before deploying native voice, add a deterministic turn gate:

1. Stream microphone audio only while the user is actively speaking.
2. End the turn explicitly and obtain the finalized input transcript.
3. Run the existing deterministic safety classifier locally or through the
   authenticated backend.
4. For a safety match, cancel model output and play the deterministic response.
5. Otherwise send the approved transcript and compact workout snapshot to the
   conversational session.

Do not enable background/proactive listening for the fitness coach. Tool calls
must remain read-only until separate authorization and confirmation UX exists.

## Lightweight browser implementation

- Use a raw WebSocket plus a small `AudioWorklet`; do not add a large client AI
  SDK to the shared application bundle.
- Load the live-voice module only after the user selects **Start live coach**.
- Resample microphone input to 16 kHz mono PCM in the worklet and send short
  chunks. Keep playback buffering bounded and discard it immediately on barge-in.
- Keep movement inference at its existing throttled rate and send only stored
  aggregate events through the tool snapshot. During an active workout voice
  session, send only corrective or periodic compact rep summaries so the coach
  does not narrate every repetition.
- Stop tracks, close the `AudioContext` and WebSocket, clear playback buffers,
  and discard the ephemeral token on stop, navigation, tab hiding, or error.
- Enable context-window compression and session resumption, but set a product
  time limit and an idle timeout to control battery, bandwidth, and cost.

## Delivery status

1. Done: authenticated ephemeral-token endpoint with rate limiting and fixed
   model/audio constraints.
2. Done: read-only live-workout snapshot endpoint with authenticated ownership
   and redacted context builders.
3. Done: lazily loaded microphone worklet, raw WebSocket client, native audio
   playback, visible transcript, and interruption handling.
4. Partial: transcript persistence is done; the pre-response deterministic
   safety gate remains required before deployment.
5. Done: context-window compression, bounded initial thread history,
   session-resumption handles, automatic reconnect, and a real provider setup
   smoke test.
6. Pending: physical mobile-device calibration, cost telemetry, and the
   deterministic pre-response safety gate described above.
