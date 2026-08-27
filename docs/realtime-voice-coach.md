# Real-time voice coach proposal

This proposal extends the implemented push-to-talk experience into an optional
low-latency voice session without weakening ForgeFit's authentication, privacy,
or deterministic fitness-safety boundaries.

## Recommended architecture

```text
Authenticated browser
  |-- POST /api/backend/coach/live-token
  |     -> authenticated backend creates a one-use, short-lived Gemini token
  |
  |-- audio (only while the user holds or enables the session control)
  |     -> direct WebSocket to Gemini Live using the ephemeral token
  |
  |-- authenticated tool request: get_live_workout_snapshot
  |     -> same-origin backend proxy
  |     -> active workout, logged sets, and compact movement aggregates
  |     <- no camera frames, landmark arrays, or free-form health records
  |
  `-- streamed audio response + visible transcript
```

The browser-to-Gemini connection avoids routing high-frequency PCM audio
through the application containers. The permanent `GEMINI_API_KEY` stays in the
backend. The backend provisions one-use ephemeral tokens constrained to the
reviewed model, audio response modality, session settings, and tool schema.

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

The first production version should therefore remain turn-gated:

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
  aggregate events through the tool snapshot.
- Stop tracks, close the `AudioContext` and WebSocket, clear playback buffers,
  and discard the ephemeral token on stop, navigation, tab hiding, or error.
- Enable context-window compression and session resumption, but set a product
  time limit and an idle timeout to control battery, bandwidth, and cost.

## Delivery slices

1. Authenticated ephemeral-token endpoint with rate limiting and fixed session
   constraints.
2. Read-only live-workout snapshot endpoint plus ownership and redaction tests.
3. Lazily loaded microphone worklet, WebSocket client, audio playback, visible
   transcript, and interruption handling.
4. Turn-level deterministic safety gate and transcript persistence.
5. Mobile browser/device calibration, cost telemetry, failure fallback to the
   existing text and push-to-talk experience.
