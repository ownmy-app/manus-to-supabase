/**
 * Direct Storage API Routes - Replacement for v1/storage/upload and v1/storage/downloadUrl
 * 
 * Uses Supabase Storage as the backend.
 * 
 * Usage: Register this router in your Express app
 *   import { registerStorageRoutes } from './_core/forge-replacement-apis/storage';
 *   registerStorageRoutes(app);
 */
import type { Express, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../env";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Create Supabase client for storage
function getSupabaseStorage() {
  const supabaseUrl = ENV.supabaseUrl;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Supabase storage not configured: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)"
    );
  }

  // Supabase API keys are JWTs; reject raw signing secrets like SUPABASE_JWT_SECRET.
  if (supabaseServiceKey.split(".").length !== 3) {
    throw new Error(
      "Invalid Supabase API key format. Use SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY), not SUPABASE_JWT_SECRET."
    );
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * POST /v1/storage/upload
 * 
 * Replaces: v1/storage/upload
 * 
 * Query params:
 *   - path: string (required) - The storage path/key for the file
 * 
 * Request: multipart/form-data
 *   - file: file (required)
 * 
 * Response:
 * {
 *   url: string,
 *   key: string
 * }
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    console.log("[Storage Upload] Request received:", {
      method: req.method,
      path: req.path,
      query: req.query,
      hasFile: !!req.file,
    });
    
    const path = req.query.path as string;
    
    if (!path) {
      return res.status(400).json({ error: "path query parameter is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const supabase = getSupabaseStorage();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "files";
    
    // Normalize path (remove leading slash)
    const normalizedPath = path.replace(/^\/+/, "");
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(normalizedPath, req.file.buffer, {
        contentType: req.file.mimetype || "application/octet-stream",
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(normalizedPath);

    const result = { 
      url: urlData.publicUrl,
      key: normalizedPath,
    };
    
    console.log("[Storage Upload] Success:", result);
    res.json(result);
  } catch (error) {
    console.error("[Storage] Upload failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Storage upload failed: ${message}` });
  }
});

/**
 * GET /v1/storage/downloadUrl
 * 
 * Replaces: v1/storage/downloadUrl
 * 
 * Query params:
 *   - path: string (required) - The storage path/key for the file
 * 
 * Response:
 * {
 *   url: string
 * }
 */
router.get("/downloadUrl", async (req: Request, res: Response) => {
  try {
    const path = req.query.path as string;
    
    if (!path) {
      return res.status(400).json({ error: "path query parameter is required" });
    }

    const supabase = getSupabaseStorage();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "files";
    
    // Normalize path
    const normalizedPath = path.replace(/^\/+/, "");
    
    // Get public URL (or signed URL for private files)
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(normalizedPath);

    res.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error("[Storage] Download URL failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Failed to get download URL: ${message}` });
  }
});

export function registerStorageRoutes(app: Express): void {
  app.use("/v1/storage", router);
}
