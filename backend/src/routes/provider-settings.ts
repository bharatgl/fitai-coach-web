import type {
  ProviderSettingsResponse,
  UpdateProviderSettingsRequest,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import {
  deleteProviderSetting,
  providerSettingsStatus,
  updateProviderSettings,
} from "../services/provider-settings.js";

const updateInput = z.object({
  ai: z.object({
    provider: z.enum(["gemini", "openai", "anthropic", "openai_compatible"]),
    apiKey: z.string().trim().min(8).max(500).optional(),
    model: z.string().trim().min(2).max(120).optional(),
    baseUrl: z.string().trim().url().max(500).nullable().optional(),
  }).optional(),
  elevenlabs: z.object({
    apiKey: z.string().trim().min(8).max(500).optional(),
    agentId: z.string().trim().max(200).optional(),
    voiceId: z.string().trim().max(200).optional(),
    model: z.string().trim().min(2).max(120).optional(),
  }).optional(),
}).refine((value) => value.ai || value.elevenlabs, {
  message: "At least one provider setting is required",
}).superRefine((value, context) => {
  if (!value.ai?.baseUrl) return;
  const protocol = new URL(value.ai.baseUrl).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    context.addIssue({
      code: "custom",
      path: ["ai", "baseUrl"],
      message: "The provider base URL must use HTTP or HTTPS",
    });
  }
});
const providerParams = z.object({ provider: z.enum(["ai", "elevenlabs"]) });

export async function providerSettingsRoutes(app: FastifyInstance) {
  app.get("/v1/provider-settings", async (request): Promise<ProviderSettingsResponse> => {
    const user = await authenticate(request);
    return providerSettingsStatus(user.id);
  });

  app.put(
    "/v1/provider-settings",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request): Promise<ProviderSettingsResponse> => {
      const user = await authenticate(request);
      const input = updateInput.parse(request.body) as UpdateProviderSettingsRequest;
      return updateProviderSettings(user.id, input);
    },
  );

  app.delete(
    "/v1/provider-settings/:provider",
    async (request): Promise<ProviderSettingsResponse> => {
      const user = await authenticate(request);
      const { provider } = providerParams.parse(request.params);
      return deleteProviderSetting(user.id, provider);
    },
  );
}
