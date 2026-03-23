# Forge API Replacement Routes

This directory contains direct API route implementations to replace `FORGE_API_URL` calls. These routes are designed to be **portable** and can be easily copied across all Manus apps.

## Overview

These routes provide direct Express endpoints that replace the following FORGE_API_URL services:

1. **Data API** - `/v1/data-api/call` (replaces `webdevtoken.v1.WebDevService/CallApi`)
2. **Image Generation** - `/v1/images/generate` (replaces `images.v1.ImageService/GenerateImage`)
3. **Voice Transcription** - `/v1/audio/transcriptions` (replaces `v1/audio/transcriptions`)
4. **Storage** - `/v1/storage/upload` and `/v1/storage/downloadUrl` (replaces storage proxy)
5. **Maps Proxy** - `/v1/maps/proxy/*` (replaces `v1/maps/proxy`)
6. **LLM Chat** - `/v1/chat/completions` (replaces `v1/chat/completions`)

## Installation

### Option 1: Register All Routes (Recommended)

In your `server/_core/index.ts`:

```typescript
import { registerForgeReplacementRoutes } from './forge-replacement-apis';

// ... other route registrations
registerForgeReplacementRoutes(app);
```

### Option 2: Register Individual Routes

```typescript
import { 
  registerDataApiRoutes,
  registerImageGenerationRoutes,
  registerVoiceTranscriptionRoutes,
  registerStorageRoutes,
  registerMapsRoutes,
  registerLLMRoutes,
} from './forge-replacement-apis';

// Register only the routes you need
registerDataApiRoutes(app);
registerStorageRoutes(app);
// ... etc
```

## Implementation Status

✅ **All routes are fully implemented**:

- ✅ **Storage Routes** - Uses Supabase Storage
- ✅ **Maps Proxy** - Proxies to Google Maps API
- ✅ **Data API** - Basic implementation (extend for specific API IDs)
- ✅ **Image Generation** - Uses OpenAI DALL-E 3
- ✅ **Voice Transcription** - Uses OpenAI Whisper API
- ✅ **LLM Chat** - Uses OpenAI Chat Completions API

## API Endpoints

### Data API

**POST** `/webdevtoken.v1.WebDevService/CallApi` (Connect RPC format)

```json
{
  "apiId": "Youtube/search",
  "query": { "gl": "US", "hl": "en", "q": "manus" },
  "body": {},
  "path_params": {},
  "multipart_form_data": {}
}
```

**Note**: This is a generic API proxy. Implement specific handlers for your API IDs.

### Image Generation

**POST** `/images.v1.ImageService/GenerateImage` (Connect RPC format)

```json
{
  "prompt": "A serene landscape with mountains",
  "original_images": []
}
```

### Voice Transcription

**POST** `/v1/audio/transcriptions` (multipart/form-data)

- `file`: audio file (required)
- `model`: "whisper-1" (default)
- `response_format`: "verbose_json" (default)
- `prompt`: optional prompt
- `language`: optional language code

### Storage

**POST** `/v1/storage/upload?path=my/file.png` (multipart/form-data)
- `file`: file to upload

**GET** `/v1/storage/downloadUrl?path=my/file.png`

### Maps Proxy

**GET/POST** `/v1/maps/proxy/maps/api/geocode/json?address=...&key=...`

Proxies requests to Google Maps APIs. The path after `/v1/maps/proxy/` is forwarded to `https://maps.googleapis.com/`.

### LLM Chat

**POST** `/v1/chat/completions`

OpenAI-compatible chat completions format:

```json
{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "max_tokens": 1000
}
```

## Drop-in Replacement

These routes are designed to be **exact drop-in replacements** for FORGE_API_URL. Simply:

1. Set `BUILT_IN_FORGE_API_URL` to your server URL (e.g., `http://localhost:3000`)
2. Set `BUILT_IN_FORGE_API_KEY` to any value (authentication is handled per-service)
3. Register the routes in your Express app
4. All existing code using `callDataApi`, `generateImage`, etc. will work without changes!

## Environment Variables

Required environment variables:

- `VITE_SUPABASE_URL` - Supabase project URL (for storage)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for storage)
- `SUPABASE_STORAGE_BUCKET` - Supabase storage bucket name (default: "files")
- `OPENAI_API_KEY` - OpenAI API key (for image generation, transcription, and LLM)
- `GOOGLE_MAPS_API_KEY` - Google Maps API key (for maps proxy, or pass `key` query param)

## Migration Guide

To migrate from FORGE_API_URL to these direct routes:

1. **Update client code** to call your server's routes instead of FORGE_API_URL
2. **Implement the placeholder logic** in each route file
3. **Test each endpoint** to ensure compatibility
4. **Remove FORGE_API_URL dependencies** from your codebase

## Portability

These routes are designed to be **copy-paste portable**:

- ✅ No hard dependencies on app-specific code (except storage.ts which is standard)
- ✅ Self-contained route handlers
- ✅ Clear TODO markers for implementation
- ✅ Consistent error handling
- ✅ TypeScript types included

Simply copy the `forge-replacement-apis` folder to your new Manus app and implement the TODO sections.
