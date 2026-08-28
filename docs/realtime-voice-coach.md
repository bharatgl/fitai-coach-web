# Real-time voice coach

ForgeFit now uses an authenticated ElevenLabs conversational agent as the primary
live voice coach, with the previous Gemini Live path retained as an automatic
fallback. The interaction has an explicit call lifecycle, visible listening and
speaking state, interruption, and tool-backed application context. The idle state
uses a lightweight human preview; an active configured session swaps it for a
photoreal, lip-synced WebRTC avatar rather than a local cartoon model.

## Implemented locally

- `POST /v1/coach/elevenlabs-session` provisions or updates the private ForgeFit
  agent, returns a short-lived signed URL, and supplies the authenticated member's
  name, profile/training snapshot, browser timezone, authoritative current local
  date/time, and bounded timestamped thread history as dynamic variables.
- The agent greets the member by name and uses the deeper, resonant male
  `ForgeFit Brian` voice by default. Coaching language and examples remain
  India-focused; an Indian-accented replacement voice requires an eligible
  ElevenLabs library plan or a configured Indian TTS provider.
- `POST /v1/coach/live-token` remains as the one-use Gemini Live fallback when
  ElevenLabs is temporarily unavailable.
- `GET /v1/coach/live-snapshot` returns a redacted profile, current plan,
  readiness, active-session sets, recent sessions, and compact movement data.
- The lazily loaded official ElevenLabs browser client uses an authenticated
  WebSocket, supports interruption, and closes microphone, audio, and network
  resources on stop or backgrounding.
- Completed user and coach transcripts are saved through
  `POST /v1/coach/live-turns` into the same ongoing text thread.
- Each new socket is seeded with a bounded chronological window from that
  ongoing thread. Persisted turns retain their original local timestamps so a
  new calendar day expires stale future-looking intentions such as a prior-night
  sleep plan. Context-window compression and Gemini session-resumption handles
  keep context across provider connection rotations.
- The workout screen can open the same live coach while MediaPipe tracks a
  supported movement locally. Corrective and periodic rep summaries are sent
  as compact text signals; raw frames and landmarks remain in the browser.
- The live-coach stage now has an explicit workout-camera control. It requests
  the front camera only after the member taps **Turn camera on**, shows a private
  mobile-first preview, and runs MediaPipe rep/range-of-motion tracking when an
  active supported workout is available. Without one, it remains preview-only.
- When the member explicitly asks the coach to inspect their physique, posture,
  form, or current camera view, the `analyze_camera_view` client tool captures
  one downscaled JPEG and sends it to the authenticated vision endpoint. The
  frame is analyzed in memory and is not stored. Routine pose tracking remains
  entirely on-device.
- `POST /v1/coach/live-avatar-token` creates a short-lived Simli session on the
  authenticated backend, keeping `SIMLI_API_KEY` out of the browser.
- The live surface forwards ElevenLabs 16 kHz PCM callbacks to Simli and mutes
  duplicate local playback while the lip-synced avatar is active. Gemini's native
  24 kHz PCM is still resampled on the fallback path. Voice-only mode remains
  available when the avatar provider is unavailable.
- The primary coach uses the backend-configured `ELEVENLABS_VOICE_ID`, or the
  selected male Indian-English default. The Gemini fallback uses
  `GEMINI_LIVE_VOICE` (`Charon` by default). Both prompts mirror Hindi,
  Punjabi, or Hinglish when the member uses those languages.
- The call layout is mobile-first and expands into a two-column coach stage at
  48rem.
- Browser `speechSynthesis` is no longer presented as a voice-agent feature.

## Recommended architecture

```text
Authenticated browser
  |-- POST /api/backend/coach/elevenlabs-session
  |     -> authenticated backend returns a short-lived signed agent URL
  |     -> name + profile + plan + local clock + timestamped thread become dynamic variables
  |
  |-- POST /api/backend/coach/live-avatar-token
  |     -> authenticated backend creates a short-lived Simli session token
  |
  |-- audio (only while the live session is explicitly active)
  |     -> authenticated WebSocket to the private ElevenLabs agent
  |
  |-- authenticated tool request: get_live_workout_snapshot
  |     -> same-origin backend proxy
  |     -> active workout, logged sets, and compact movement aggregates
  |     <- no camera frames, landmark arrays, or free-form health records
  |
  |-- explicit visual tool request: analyze_camera_view(focus)
  |     -> one compressed current frame to the authenticated backend
  |     -> Gemini structured visual analysis with fitness safety constraints
  |     <- observations, limitations, and one actionable next step; no storage
  |
  |-- on-device movement signal (corrective or every third rep)
  |     -> exercise, rep, duration, ROM, confidence, and local cue only
  |
  |-- streamed ElevenLabs PCM response
  |     -> sent to Simli for lip sync only while active
  |
  `-- lip-synced WebRTC avatar video/audio + visible transcript
```

High-frequency audio does not pass through the application containers. Permanent
`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, and `SIMLI_API_KEY` values stay in the
backend. The ElevenLabs agent is private and browser sessions use short-lived
signed URLs; the member sees only their own name and coaching context.

## Real-time workout data

Expose two read-only functions to the live model:

```text
get_live_workout_snapshot()
analyze_camera_view(focus)
```

The browser handles the tool call by requesting an authenticated snapshot from
ForgeFit. The response should contain only:

- active session ID, name, state, and elapsed active time;
- current exercises and prescribed work;
- logged set counts, reps, load, and effort;
- recent captured-rep count plus aggregate duration, confidence, and
  range-of-motion by exercise;
- an explicit timestamp so the model describes the data as a snapshot.

Do not expose continuous camera video, pose landmarks, pending database
documents, internal user IDs, API credentials, or unrestricted backend URLs as
tool data. A single compressed frame may leave the device only after an explicit
visual request, and the backend must not persist it. The model requests data;
application code validates and executes every tool.

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

- Dynamically import both the ElevenLabs browser client and avatar SDK only after
  a member explicitly starts live coaching. The raw WebSocket and `AudioWorklet`
  remain isolated to the Gemini fallback.
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

1. Done: authenticated ElevenLabs signed-session endpoint plus Gemini
   ephemeral-token fallback, both rate limited and server configured.
2. Done: read-only live-workout snapshot endpoint with authenticated ownership
   and redacted context builders.
3. Done: lazily loaded ElevenLabs client, fallback microphone worklet/raw
   WebSocket, visible transcript, and interruption handling.
4. Partial: transcript persistence is done; the pre-response deterministic
   safety gate remains required before deployment.
5. Done: context-window compression, bounded initial thread history,
   session-resumption handles, automatic reconnect, and a real provider setup
   smoke test.
6. Pending: physical mobile-device calibration, cost telemetry, and the
   deterministic pre-response safety gate described above.
7. Done in code, configuration required: authenticated Simli token endpoint,
   lazy WebRTC avatar client, 24 kHz-to-16 kHz PCM conversion, interruption
   buffer clearing, voice-only fallback, and mobile-first video layout. Set a
   male `SIMLI_FACE_ID` and `SIMLI_API_KEY` to activate it.
8. Done: explicit live-session workout camera, private preview fallback,
   on-device pose overlay, compact rep-summary persistence, and live movement
   cues forwarded to the active voice agent.
9. Done: explicit still-frame visual analysis shared by ElevenLabs and Gemini
   Live, with authenticated transport, rate/size limits, no frame persistence,
   honest framing guidance, and sensitive-inference safeguards.
