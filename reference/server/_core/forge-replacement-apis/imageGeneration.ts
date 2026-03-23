/**
 * Direct Image Generation API Route - Replacement for images.v1.ImageService/GenerateImage
 * 
 * This is a portable module that can be copied across Manus apps.
 * It provides a direct API endpoint to replace FORGE_API_URL calls.
 * 
 * Usage: Register this router in your Express app
 *   import { registerImageGenerationRoutes } from './_core/forge-replacement-apis/imageGeneration';
 *   registerImageGenerationRoutes(app);
 */
import type { Express, Request, Response } from "express";
import { Router } from "express";
import { ENV } from "../env";

const router = Router();

/**
 * POST /GenerateImage
 * 
 * Replaces: images.v1.ImageService/GenerateImage (Connect RPC format)
 * Uses OpenAI DALL-E for image generation.
 * 
 * Request body:
 * {
 *   prompt: string,
 *   original_images?: Array<{
 *     url?: string,
 *     b64Json?: string,
 *     mimeType?: string
 *   }>
 * }
 * 
 * Response:
 * {
 *   image: {
 *     b64Json: string,
 *     mimeType: string
 *   }
 * }
 */
router.post("/GenerateImage", async (req: Request, res: Response) => {
  try {
    const { prompt, original_images } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required and must be a string" });
    }

    const apiKey = ENV.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    // Use DALL-E 3 for generation
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const result = await response.json() as {
      data: Array<{ b64_json: string }>;
    };

    if (!result.data || result.data.length === 0) {
      throw new Error("No image generated");
    }

    const base64Image = result.data[0].b64_json;

    res.json({
      image: {
        b64Json: base64Image,
        mimeType: "image/png",
      },
    });
  } catch (error) {
    console.error("[Image Generation] Request failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Image generation request failed: ${message}` });
  }
});

export function registerImageGenerationRoutes(app: Express): void {
  // Connect RPC format: images.v1.ImageService/GenerateImage
  app.use("/images.v1.ImageService", router);
}
