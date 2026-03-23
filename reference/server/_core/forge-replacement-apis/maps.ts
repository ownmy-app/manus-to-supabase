/**
 * Direct Maps Proxy API Route - Replacement for v1/maps/proxy
 * 
 * This is a portable module that can be copied across Manus apps.
 * It provides a direct API endpoint to replace FORGE_API_URL calls.
 * 
 * Usage: Register this router in your Express app
 *   import { registerMapsRoutes } from './_core/forge-replacement-apis/maps';
 *   registerMapsRoutes(app);
 * 
 * Requires: GOOGLE_MAPS_API_KEY environment variable
 */
import type { Express, Request, Response } from "express";
import { Router } from "express";
import { ENV } from "../env";

const router = Router();

/**
 * GET/POST /v1/maps/proxy/*
 * 
 * Replaces: v1/maps/proxy/*
 * 
 * This route proxies requests to Google Maps APIs.
 * The endpoint path after /v1/maps/proxy/ is forwarded to Google Maps API.
 * 
 * Query params: All query params are forwarded to Google Maps API
 *   - key: string (required) - Google Maps API key (can also be set via GOOGLE_MAPS_API_KEY env var)
 *   - ...other Google Maps API params
 * 
 * Request body (for POST requests): Forwarded to Google Maps API
 */
router.all("/proxy/*", async (req: Request, res: Response) => {
  try {
    // Extract the Google Maps API endpoint from the path
    const mapsEndpoint = req.path.replace("/proxy", "");
    
    // Get API key from query params or environment
    const apiKey = (req.query.key as string) || process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ 
        error: "Google Maps API key is required",
        message: "Provide 'key' query parameter or set GOOGLE_MAPS_API_KEY environment variable"
      });
    }

    // Build Google Maps API URL
    const googleMapsBaseUrl = "https://maps.googleapis.com";
    const url = new URL(`${googleMapsBaseUrl}${mapsEndpoint}`);
    
    // Forward all query parameters (including the key)
    Object.entries(req.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    
    // Ensure API key is set
    if (!url.searchParams.has("key")) {
      url.searchParams.set("key", apiKey);
    }

    // Make request to Google Maps API
    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: req.method !== "GET" && req.body ? JSON.stringify(req.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return res.status(response.status).json({
        error: `Google Maps API request failed`,
        details: errorText || response.statusText,
      });
    }

    // Forward the response
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      res.json(data);
    } else {
      // For non-JSON responses (e.g., static maps images)
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.send(Buffer.from(buffer));
    }
  } catch (error) {
    console.error("[Maps Proxy] Request failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Google Maps API request failed: ${message}` });
  }
});

export function registerMapsRoutes(app: Express): void {
  app.use("/v1/maps", router);
}
