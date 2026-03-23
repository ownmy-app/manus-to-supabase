/**
 * Unified SDK that handles both Supabase and OAuth authentication flows.
 * Automatically detects Supabase JWT tokens and handles them accordingly,
 * otherwise delegates to the original OAuth SDK.
 */
import type {
  ExchangeTokenResponse,
  GetUserInfoResponse,
} from "./types/manusTypes";
import { sdk as originalSdk } from "./sdk";
import { verifySupabaseToken } from "./supabase-auth";
import { ENV } from "./env";

/**
 * Check if a string is a JWT token (starts with eyJ and has 3 parts separated by dots)
 */
function isJwtToken(str: string): boolean {
  return /^eyJ[A-Za-z0-9-_]*\.eyJ[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*$/.test(str);
}

class UnifiedSDK {
  /**
   * Exchange code for token. If code is a Supabase JWT, returns it as-is.
   * Otherwise, delegates to the original OAuth SDK.
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    // If code is a Supabase JWT token, return it as the access token
    if (isJwtToken(code)) {
      return {
        accessToken: code,
        tokenType: "Bearer",
        expiresIn: 3600,
        scope: "openid profile email",
        idToken: code,
      };
    }

    // Otherwise, use the original OAuth flow
    return originalSdk.exchangeCodeForToken(code, state);
  }

  /**
   * Get user information from access token. If token is a Supabase JWT,
   * extracts user info from the token claims. Otherwise, delegates to OAuth SDK.
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    // If access token is a Supabase JWT token, verify and extract user info
    if (isJwtToken(accessToken)) {
      try {
        const claims = await verifySupabaseToken(accessToken);
        const name =
          claims.user_metadata?.full_name ??
          claims.user_metadata?.name ??
          claims.email ??
          "";

        return {
          openId: claims.sub, // Use Supabase user ID (sub) as openId
          projectId: ENV.appId, // Use app ID as project ID
          name: name,
          email: claims.email ?? null,
          platform: "supabase",
          loginMethod: "supabase",
        };
      } catch (error) {
        // If Supabase verification fails, try as OAuth token
        console.error("[UnifiedSDK] Supabase token verification failed, trying as OAuth:", error);
        return originalSdk.getUserInfo(accessToken);
      }
    }

    // Otherwise, use the original OAuth flow
    return originalSdk.getUserInfo(accessToken);
  }

  /**
   * Create a session token. Delegates to the original SDK.
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return originalSdk.createSessionToken(openId, options);
  }

  // Delegate all other methods to the original SDK
  async getUserInfoWithJwt(jwtToken: string) {
    return originalSdk.getUserInfoWithJwt(jwtToken);
  }

  async authenticateRequest(req: any) {
    return originalSdk.authenticateRequest(req);
  }
}

export const sdk = new UnifiedSDK();
