/**
 * Direct Voice Transcription API Route - Replacement for v1/audio/transcriptions
 * 
 * This is a portable module that can be copied across Manus apps.
 * It provides a direct API endpoint to replace FORGE_API_URL calls.
 * 
 * Usage: Register this router in your Express app
 *   import { registerVoiceTranscriptionRoutes } from './_core/forge-replacement-apis/voiceTranscription';
 *   registerVoiceTranscriptionRoutes(app);
 */
import type { Express, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { ENV } from "../env";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } }); // 16MB limit

/**
 * POST /v1/audio/transcriptions
 * 
 * Replaces: v1/audio/transcriptions (OpenAI Whisper API format)
 * Uses OpenAI Whisper API for transcription.
 * 
 * Request: multipart/form-data
 *   - file: audio file (required)
 *   - model: string (default: "whisper-1")
 *   - response_format: string (default: "verbose_json")
 *   - prompt: string (optional)
 *   - language: string (optional)
 * 
 * Response (verbose_json format):
 * {
 *   task: "transcribe",
 *   language: string,
 *   duration: number,
 *   text: string,
 *   segments: Array<{
 *     id: number,
 *     seek: number,
 *     start: number,
 *     end: number,
 *     text: string,
 *     tokens: number[],
 *     temperature: number,
 *     avg_logprob: number,
 *     compression_ratio: number,
 *     no_speech_prob: number
 *   }>
 * }
 */
router.post("/transcriptions", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const { model = "whisper-1", response_format = "verbose_json", prompt, language } = req.body;

    // Check file size (16MB limit)
    const sizeMB = req.file.size / (1024 * 1024);
    if (sizeMB > 16) {
      return res.status(400).json({
        error: "Audio file exceeds maximum size limit",
        details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`,
      });
    }

    const apiKey = ENV.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    // Create FormData for OpenAI Whisper API
    // Node.js 18+ has FormData built-in
    const formData = new FormData();
    
    // Append the file buffer - create a File-like object
    // In Node.js, we can use the File constructor or append Buffer directly
    const fileBlob = new Blob([req.file.buffer], { 
      type: req.file.mimetype || "audio/mpeg" 
    });
    formData.append("file", fileBlob, req.file.originalname || "audio.mp3");
    formData.append("model", model);
    formData.append("response_format", response_format);
    
    if (prompt) {
      formData.append("prompt", prompt);
    }
    if (language) {
      formData.append("language", language);
    }

    // Call OpenAI Whisper API
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Whisper API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("[Voice Transcription] Request failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Transcription request failed: ${message}` });
  }
});

export function registerVoiceTranscriptionRoutes(app: Express): void {
  app.use("/v1/audio", router);
}
