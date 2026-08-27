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

export type SpeechVoiceLike = {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
};

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

export function selectNaturalSpeechVoice<T extends SpeechVoiceLike>(
  voices: T[],
  locale: string,
) {
  if (!voices.length) return null;
  const requested = locale.toLowerCase().replace("_", "-");
  const requestedLanguage = requested.split("-")[0];
  const matchingLanguage = voices.filter(
    (voice) => voice.lang.toLowerCase().replace("_", "-").split("-")[0] === requestedLanguage,
  );
  const candidates = matchingLanguage.length ? matchingLanguage : voices;

  return [...candidates].sort((left, right) => {
    const score = (voice: T) => {
      const language = voice.lang.toLowerCase().replace("_", "-");
      const name = voice.name.toLowerCase();
      let value = language === requested ? 40 : language.split("-")[0] === requestedLanguage ? 20 : 0;
      if (/natural|neural|enhanced|premium/.test(name)) value += 90;
      if (/google/.test(name)) value += 55;
      if (/samantha|ava|serena|daniel|aaron|arthur|rishi|karen|moira|alex|allison/.test(name)) value += 45;
      if (/compact|espeak|festival|robot/.test(name)) value -= 120;
      if (voice.default) value += 8;
      if (voice.localService) value += 3;
      return value;
    };
    return score(right) - score(left);
  })[0] ?? null;
}

export function prepareCoachSpeech(content: string, maximumLength = 900) {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  const evidenceIndex = normalized.search(
    /(?:^|\n)\s*(?:#{1,6}\s*)?personalized from your data\s*:?(?:\n|$)/i,
  );
  const spokenSection = evidenceIndex >= 0 ? normalized.slice(0, evidenceIndex) : normalized;
  const text = spokenSection
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const isHeading = /^#{1,6}\s+/.test(trimmed);
      const isListItem = /^(?:[-*•]|\d+[.)])\s+/.test(trimmed);
      const cleaned = trimmed
        .replace(/^#{1,6}\s+/, "")
        .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/\S+/g, "the link shown on screen")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/[_`~*]/g, "")
        .replace(/\bRPE\b/g, "R P E")
        .replace(/\b(\d+(?:\.\d+)?)\s*kg\b/gi, "$1 kilograms");
      return (isHeading || isListItem) && !/[.!?]$/.test(cleaned) ? `${cleaned}.` : cleaned;
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();

  if (text.length <= maximumLength) return text;
  const preview = text.slice(0, maximumLength);
  const sentenceEnd = Math.max(
    preview.lastIndexOf(". "),
    preview.lastIndexOf("? "),
    preview.lastIndexOf("! "),
  );
  const cutoff = sentenceEnd >= maximumLength * 0.6 ? sentenceEnd + 1 : maximumLength;
  return `${preview.slice(0, cutoff).trim()} I've put the full detail on screen for you.`;
}

export function splitSpeechIntoChunks(text: string, maximumLength = 260) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? [];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maximumLength && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
