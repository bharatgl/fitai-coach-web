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
const unsafeContestPrepPattern =
  /(?:how|help|tell|show|plan).{0,40}(?:dehydrat|water cut|diuretic|laxative|vomit|purg|sauna suit|sweat suit|rubber suit)|(?:dose|cycle|how much).{0,30}(?:steroid|trenbolone|clenbuterol|anavar|insulin|growth hormone)/i;

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

  if (unsafeContestPrepPattern.test(message)) {
    return {
      reply:
        "I can help with a gradual, food-first contest-prep plan, but I can’t provide dehydration, purging, diuretic, laxative, extreme heat, or performance-enhancing drug protocols. Those approaches can cause serious harm. Work with a qualified sports dietitian and physician for monitored show preparation; I can help you organize questions, training logs, meals, and weekly trend data for that team.",
      safetyCategory: "medical",
      shouldPauseWorkout: false,
      suggestedAdjustment: null,
    };
  }

  return null;
}
