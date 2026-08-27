import { GoogleGenAI, Modality } from "@google/genai";

export const defaultLiveCoachModel = "gemini-3.1-flash-live-preview";

export type CreateLiveCoachTokenInput = {
  apiKey: string;
  model?: string;
  systemInstruction: string;
  now?: Date;
};

export async function createLiveCoachToken({
  apiKey,
  model = defaultLiveCoachModel,
  systemInstruction,
  now = new Date(),
}: CreateLiveCoachTokenInput) {
  const client = new GoogleGenAI({ apiKey });
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1_000);
  const newSessionExpiresAt = new Date(now.getTime() + 60 * 1_000);
  const token = await client.authTokens.create({
    config: {
      abortSignal: AbortSignal.timeout(20_000),
      uses: 1,
      expireTime: expiresAt.toISOString(),
      newSessionExpireTime: newSessionExpiresAt.toISOString(),
      liveConnectConstraints: {
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
        },
      },
      lockAdditionalFields: [],
    },
  });

  if (!token.name) throw new Error("The voice provider did not return a session token");
  return {
    token: token.name,
    model,
    expiresAt: expiresAt.toISOString(),
  };
}
