export type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

export type SpeechRecognitionErrorLike = {
  error: string;
};

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionScope = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function speechRecognitionConstructor(scope: SpeechRecognitionScope) {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function collectSpeechTranscript(event: SpeechRecognitionEventLike) {
  let finalTranscript = "";
  let interimTranscript = "";
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript.trim();
    if (!transcript) continue;
    if (result.isFinal) finalTranscript += `${transcript} `;
    else interimTranscript += `${transcript} `;
  }
  return {
    finalTranscript: finalTranscript.trim(),
    interimTranscript: interimTranscript.trim(),
    combinedTranscript: `${finalTranscript}${interimTranscript}`.trim(),
  };
}

export function speechRecognitionErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was denied. Allow it in browser settings or type your message.";
  }
  if (error === "no-speech") return "No speech was detected. Hold the button while speaking.";
  if (error === "audio-capture") return "No microphone is available. You can keep typing instead.";
  if (error === "network") return "The browser speech service is unavailable. Try again or type your message.";
  return "Voice input stopped unexpectedly. Try again or type your message.";
}
