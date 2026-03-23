/**
 * Direct LLM Chat Completions API Route - Replacement for v1/chat/completions
 * 
 * This is a portable module that can be copied across Manus apps.
 * It provides a direct API endpoint to replace FORGE_API_URL calls.
 * 
 * Usage: Register this router in your Express app
 *   import { registerLLMRoutes } from './_core/forge-replacement-apis/llm';
 *   registerLLMRoutes(app);
 * 
 * Requires: OPENAI_API_KEY or your LLM provider API key in environment variable
 */
import type { Express, Request, Response } from "express";
import { Router } from "express";
import { ENV } from "../env";

const router = Router();

/**
 * POST /v1/chat/completions
 * 
 * Replaces: v1/chat/completions (OpenAI-compatible format)
 * Uses OpenAI API for chat completions.
 * 
 * Request body (OpenAI Chat Completions format):
 * {
 *   model: string,
 *   messages: Array<{ role: string, content: string }>,
 *   tools?: Array<...>,
 *   tool_choice?: ...,
 *   max_tokens?: number,
 *   temperature?: number,
 *   response_format?: { type: "json_schema" | "json_object" | "text", ... },
 *   thinking?: { budget_tokens: number },
 *   ...other OpenAI params
 * }
 * 
 * Response (OpenAI Chat Completions format):
 * {
 *   id: string,
 *   object: "chat.completion",
 *   created: number,
 *   model: string,
 *   choices: Array<{
 *     index: number,
 *     message: { role: string, content: string, tool_calls?: ... },
 *     finish_reason: string
 *   }>,
 *   usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
 * }
 */
router.post("/completions", async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    if (!payload.model) {
      return res.status(400).json({ error: "model is required" });
    }

    if (!payload.messages || !Array.isArray(payload.messages)) {
      return res.status(400).json({ error: "messages is required and must be an array" });
    }

    const apiKey = ENV.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    // Remove thinking parameter if present (not supported by OpenAI)
    const { thinking, ...openAIPayload } = payload;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openAIPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("[LLM] Chat completions failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `LLM invoke failed: ${message}` });
  }
});

export function registerLLMRoutes(app: Express): void {
  app.use("/v1/chat", router);
}
