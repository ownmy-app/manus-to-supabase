/**
 * Supabase auth callback: exchange Supabase JWT for app session cookie.
 *
 * Verification is chosen by the token's algorithm:
 * - HS256 (legacy): set SUPABASE_JWT_SECRET (Supabase Dashboard → Project Settings → API → JWT Secret).

 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import * as db from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

type SupabaseClaims = {
  sub: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
};

/**
 * Verify Supabase access_token using JWKS (RS256/ES256) – recommended for Supabase.
 * JWKS URL: https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
 */
async function verifyWithJwks(accessToken: string): Promise<SupabaseClaims> {
  const base = ENV.supabaseUrl.replace(/\/$/, "");

  if (!base) throw new Error("VITE_SUPABASE_URL is not set");

  const issuer = `${base}/auth/v1`;
  const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
  const JWKS = createRemoteJWKSet(jwksUrl);
  const { payload } = await jwtVerify(accessToken, JWKS, {
    algorithms: ["RS256", "ES256"],
    issuer,
  });
  const sub = payload.sub;
  if (!sub || typeof sub !== "string") throw new Error("Invalid JWT: missing sub");
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const user_metadata = payload.user_metadata as SupabaseClaims["user_metadata"];
  return { sub, email, user_metadata };
}

/**
 * Verify Supabase access_token using legacy JWT secret (HS256).
 * Use only if your project still uses the legacy JWT secret.
 */
async function verifyWithSecret(accessToken: string): Promise<SupabaseClaims> {
  const secret = ENV.supabaseJwtSecret;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is required for HS256 tokens. Set it in .env (Supabase Dashboard → Project Settings → API → JWT Secret)."
    );
  }
  const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });
  const sub = payload.sub;
  if (!sub || typeof sub !== "string") throw new Error("Invalid JWT: missing sub");
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const user_metadata = payload.user_metadata as SupabaseClaims["user_metadata"];
  return { sub, email, user_metadata };
}

export async function verifySupabaseToken(accessToken: string): Promise<SupabaseClaims> {
  const header = decodeProtectedHeader(accessToken);
  const alg = header.alg;

  if (alg === "HS256") {
    return verifyWithSecret(accessToken);
  }
  if (alg === "RS256" || alg === "ES256") {
    return verifyWithJwks(accessToken);
  }
  throw new Error(`Unsupported JWT algorithm: ${alg}`);
}

export function registerSupabaseAuthRoutes(app: Express) {
  app.post("/api/auth/supabase-callback", async (req: Request, res: Response) => {
    const accessToken =
      typeof req.body?.access_token === "string" ? req.body.access_token : null;

    if (!accessToken) {
      res.status(400).json({ error: "access_token is required" });
      return;
    }

    try {
      const claims = await verifySupabaseToken(accessToken);
      const name =
        claims.user_metadata?.full_name ??
        claims.user_metadata?.name ??
        claims.email ??
        null;

      await db.upsertUser({
        openId: claims.sub,
        name,
        email: claims.email ?? null,
        loginMethod: "supabase",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(claims.sub, {
        name: name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Supabase auth: set session cookie with options that work on HTTP (e.g. localhost).
      // SameSite=None requires Secure; on HTTP use Lax so the cookie is stored.
      const secure =
        req.protocol === "https" ||
        String(req.headers["x-forwarded-proto"]).toLowerCase() === "https";
      res.cookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        path: "/",
        maxAge: ONE_YEAR_MS,
        sameSite: secure ? "none" : "lax",
        secure,
      });

      res.json({ ok: true, redirect: "/" });
    } catch (err) {
      console.error("[Supabase Auth] Callback failed:", err);
      res.status(401).json({ error: "Invalid or expired token" });
    }
  });
}
