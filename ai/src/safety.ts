export type CoachSafetyResult = {
  reply: string;
  safetyCategory: "none" | "pain" | "medical" | "emergency";
  shouldPauseWorkout: boolean;
  suggestedAdjustment: string | null;
};

const urgentPattern =
  /chest pain|cannot breathe|can['’]?t breathe|faint(ed|ing)?|sudden weakness|loss of consciousness/i;
const painPattern =
  /sharp pain|severe pain|injur(y|ed)|swelling|dizz(y|iness)|numb(ness)?|tingling/i;

export function classifySafetyMessage(message: string): CoachSafetyResult | null {
  if (urgentPattern.test(message)) {
    return {
      reply:
        "Stop exercising now. These symptoms can require urgent medical attention. Contact your local emergency service or seek immediate in-person medical help.",
      safetyCategory: "emergency",
      shouldPauseWorkout: true,
      suggestedAdjustment: null,
    };
  }

  if (painPattern.test(message)) {
    return {
      reply:
        "Pause this workout and avoid the movement that triggered the symptom. I can help you record what happened, but a qualified healthcare professional should assess pain, injury, dizziness, numbness, or swelling before you resume.",
      safetyCategory: "pain",
      shouldPauseWorkout: true,
      suggestedAdjustment: null,
    };
  }

  return null;
}
