/**
 * Forge API Replacement Routes - Main Registration
 * 
 * This module provides direct API endpoints to replace FORGE_API_URL calls.
 * All routes are portable and can be copied across Manus apps.
 * 
 * Usage in server/_core/index.ts:
 *   import { registerForgeReplacementRoutes } from './forge-replacement-apis';
 *   registerForgeReplacementRoutes(app);
 * 
 * This will register all replacement routes:
 *   - /v1/data-api/call
 *   - /v1/images/generate
 *   - /v1/audio/transcriptions
 *   - /v1/storage/upload
 *   - /v1/storage/downloadUrl
 *   - /v1/maps/proxy/*
 *   - /v1/chat/completions
 */
import type { Express } from "express";
import { registerDataApiRoutes } from "./dataApi";
import { registerImageGenerationRoutes } from "./imageGeneration";
import { registerVoiceTranscriptionRoutes } from "./voiceTranscription";
import { registerStorageRoutes } from "./storage";
import { registerMapsRoutes } from "./maps";
import { registerLLMRoutes } from "./llm";

/**
 * Register all Forge API replacement routes
 * 
 * @param app - Express application instance
 */
export function registerForgeReplacementRoutes(app: Express): void {
  // Register all replacement API routes
  // IMPORTANT: These must be registered BEFORE static file serving/Vite middleware
  registerDataApiRoutes(app);
  registerImageGenerationRoutes(app);
  registerVoiceTranscriptionRoutes(app);
  registerStorageRoutes(app);
  registerMapsRoutes(app);
  registerLLMRoutes(app);
  
  console.log("[Forge Replacement APIs] All routes registered at:");
  console.log("  - /webdevtoken.v1.WebDevService/CallApi");
  console.log("  - /images.v1.ImageService/GenerateImage");
  console.log("  - /v1/audio/transcriptions");
  console.log("  - /v1/storage/upload");
  console.log("  - /v1/storage/downloadUrl");
  console.log("  - /v1/maps/proxy/*");
  console.log("  - /v1/chat/completions");
}

// Export individual route registrars for selective registration
export {
  registerDataApiRoutes,
  registerImageGenerationRoutes,
  registerVoiceTranscriptionRoutes,
  registerStorageRoutes,
  registerMapsRoutes,
  registerLLMRoutes,
};
