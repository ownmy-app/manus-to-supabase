"use client";

import { useEffect, useState } from "react";
import { supabase } from "@shared/supabase-client.js";

function getSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const search = window.location.search || "";
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function getHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash || "";
  return new URLSearchParams(hash.replace(/^#/, ""));
}

export default function AuthCallback() {
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = getSearchParams();
    const supabaseCode = params.get("code");
    const tokenParam = params.get("token"); // Direct token from email/password auth
    // Get state and redirectUri from the original login flow (passed through Supabase OAuth)
    // The state is passed as a query param from the original getLoginUrl call
    const state = params.get("state");
    const redirectUri = params.get("redirectUri");

    const hashParams = getHashParams();
    const accessTokenFromHash = hashParams.get("access_token");

    const handleAuth = async () => {
      // 1) Direct token parameter (from email/password auth): transform and redirect to /api/oauth/callback
      if (tokenParam) {
        try {
          // Use the access token as the "code" and preserve the state
          const oauthCallbackUrl = new URL("/api/oauth/callback", window.location.origin);
          
          // State format: can be base64-encoded string or base64-encoded JSON with {redirectUri, returnUrl}
          if (state) {
            oauthCallbackUrl.searchParams.set("state", state);
          } else if (redirectUri) {
            // If no state, create one from redirectUri (base64 encoded string, matching SDK's decodeState format)
            oauthCallbackUrl.searchParams.set("state", btoa(redirectUri));
          } else {
            // Fallback: create state from default redirectUri
            const defaultRedirectUri = `${window.location.origin}/api/oauth/callback`;
            oauthCallbackUrl.searchParams.set("state", btoa(defaultRedirectUri));
          }
          // Use the Supabase access token as the "code" parameter
          oauthCallbackUrl.searchParams.set("code", tokenParam);
          
          window.location.href = oauthCallbackUrl.toString();
          return;
        } catch (err) {
          console.error("Auth callback failed (token):", err);
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
          return;
        }
      }

      // 2) Hash fragment (e.g. implicit flow): transform and redirect to /api/oauth/callback
      if (accessTokenFromHash) {
        try {
          // Use the access token as the "code" and preserve the state
          const oauthCallbackUrl = new URL("/api/oauth/callback", window.location.origin);
          
          // State format: can be base64-encoded string or base64-encoded JSON with {redirectUri, returnUrl}
          if (state) {
            oauthCallbackUrl.searchParams.set("state", state);
          } else if (redirectUri) {
            // If no state, create one from redirectUri (base64 encoded string, matching SDK's decodeState format)
            oauthCallbackUrl.searchParams.set("state", btoa(redirectUri));
          } else {
            // Fallback: create state from default redirectUri
            const defaultRedirectUri = `${window.location.origin}/api/oauth/callback`;
            oauthCallbackUrl.searchParams.set("state", btoa(defaultRedirectUri));
          }
          // Use the Supabase access token as the "code" parameter
          oauthCallbackUrl.searchParams.set("code", accessTokenFromHash);
          
          window.location.href = oauthCallbackUrl.toString();
          return;
        } catch (err) {
          console.error("Auth callback failed (hash):", err);
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
          return;
        }
      }

      // 3) PKCE flow: exchange Supabase code for session, then transform and redirect to /api/oauth/callback
      if (supabaseCode) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(supabaseCode);
          if (error) {
            console.error("Auth exchange failed:", error);
            setStatus("error");
            setErrorMessage(error.message);
            return;
          }
          const token = data?.session?.access_token;
          if (!token) {
            setStatus("error");
            setErrorMessage("No session after exchange");
            return;
          }

          // Transform Supabase session to match original OAuth callback format
          // Build the /api/oauth/callback URL with code and state parameters
          const oauthCallbackUrl = new URL("/api/oauth/callback", window.location.origin);
          
          // Preserve the state from the original login flow
          // State format matches what getLoginUrl creates: base64-encoded JSON string
          if (state) {
            oauthCallbackUrl.searchParams.set("state", state);
          } else if (redirectUri) {
            // If no state, create one from redirectUri (base64 encoded string)
            // Note: SDK's decodeState expects base64-encoded string, not JSON
            oauthCallbackUrl.searchParams.set("state", btoa(redirectUri));
          } else {
            // Fallback: create state from default redirectUri
            const defaultRedirectUri = `${window.location.origin}/api/oauth/callback`;
            oauthCallbackUrl.searchParams.set("state", btoa(defaultRedirectUri));
          }
          
          // Use the Supabase access token as the "code" parameter
          // The server endpoint will need to handle this as a Supabase token
          oauthCallbackUrl.searchParams.set("code", token);
          
          // Redirect to the original OAuth callback endpoint
          window.location.href = oauthCallbackUrl.toString();
          return;
        } catch (err) {
          console.error("Auth callback failed:", err);
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Exchange failed");
          return;
        }
      }

      // No code or token: redirect to sign-in
      window.location.href = "/app-auth";
    };

    handleAuth();
  }, []);

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-background">
        <p className="text-destructive text-sm text-center max-w-sm">{errorMessage}</p>
        <a href="/app-auth" className="text-primary underline text-sm">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col flex-1 items-center justify-center gap-4 p-4 bg-background">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      <h1 className="font-medium text-foreground">Logging in</h1>
      <p className="text-sm text-muted-foreground">
        You will be redirected automatically.
      </p>
    </div>
  );
}
