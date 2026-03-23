import { useState, useEffect } from "react";
import { supabase } from "@shared/supabase-client.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Shield } from "lucide-react";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function AuthLogo({ boardName, logoUrl, boardAbbreviation, primaryColor }: {
  boardName?: string | null;
  logoUrl?: string | null;
  boardAbbreviation?: string | null;
  primaryColor?: string | null;
}) {
  const displayName = boardName || "App";
  const initials = boardAbbreviation 
    ? boardAbbreviation.toUpperCase().slice(0, 2)
    : getInitials(displayName);
  const bgColor = primaryColor || "#667eea";

  return (
    <a href="/" className="inline-flex items-center gap-3 no-underline">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={displayName}
          className="h-12 w-auto max-w-[120px] object-contain"
        />
      ) : (
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-white",
            "shadow-lg"
          )}
          style={{
            backgroundColor: bgColor,
            boxShadow: `${bgColor}40 0 10px 20px`,
          }}
        >
          {initials || <Shield className="h-6 w-6" />}
        </div>
      )}
      <span className="text-xl font-bold tracking-tight text-white">
        {displayName}
      </span>
    </a>
  );
}

const GoogleIcon = () => (
  <svg
    className="size-5 shrink-0"
    viewBox="0 0 24 24"
    aria-hidden
    fill="currentColor"
  >
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export default function Auth() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already logged in and redirect them directly to OAuth callback
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          // User is already logged in, skip /auth/callback and go directly to /api/oauth/callback
          const currentParams = new URLSearchParams(window.location.search);
          const state = currentParams.get("state");
          const redirectUri = currentParams.get("redirectUri");
          
          const oauthCallbackUrl = new URL("/api/oauth/callback", window.location.origin);
          
          // Preserve state from the original login flow (contains returnUrl)
          if (state) {
            oauthCallbackUrl.searchParams.set("state", state);
          } else if (redirectUri) {
            // If no state, create one from redirectUri (base64 encoded string)
            oauthCallbackUrl.searchParams.set("state", btoa(redirectUri));
          } else {
            // Fallback: create state from default redirectUri
            const defaultRedirectUri = `${window.location.origin}/api/oauth/callback`;
            oauthCallbackUrl.searchParams.set("state", btoa(defaultRedirectUri));
          }
          
          // Use the Supabase access token as the "code" parameter
          oauthCallbackUrl.searchParams.set("code", session.access_token);
          
          // Redirect immediately - don't set checkingAuth to false to avoid re-render
          window.location.href = oauthCallbackUrl.toString();
          return;
        }
        // User is not logged in - safe to show auth UI
        setCheckingAuth(false);
      } catch (err) {
        console.error("Error checking auth:", err);
        setCheckingAuth(false);
      }
    };

    // Run check immediately
    checkAuth();
  }, []);

  // These hooks must be declared before any conditional return.
  const { data: boardSettings } = trpc.board.getPublicSettings.useQuery();
  const boardName = boardSettings?.boardName || "App";
  const tagline = boardSettings?.tagline;
  const primaryColor = boardSettings?.primaryColor || "#667eea";
  const secondaryColor = boardSettings?.secondaryColor || "#764ba2";

  // Sign in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign up
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirm, setSignUpConfirm] = useState("");

  // Show loading state FIRST while checking authentication - prevents flash of auth UI
  if (checkingAuth) {
    return (
      <div
        className={cn(
          "min-h-screen flex items-center justify-center",
          "bg-gradient-to-br from-[#0f0f12] via-[#1a1a24] to-[#0f0f12]",
          "text-white"
        )}
      >
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Checking authentication...</p>
        </div>
      </div>
    );
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const token = data?.session?.access_token;
      if (!token) throw new Error("No session");
      
      // Redirect to /auth/callback with token and preserve state from URL
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("token", token);
      // Preserve any existing query params (like state, redirectUri) from the original login flow
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.forEach((value, key) => {
        if (key !== "token") {
          callbackUrl.searchParams.set(key, value);
        }
      });
      
      window.location.href = callbackUrl.toString();
      return;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signUpPassword !== signUpConfirm) {
      setError("Passwords do not match");
      return;
    }
    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setSignUpSuccess(false);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: signUpEmail,
        password: signUpPassword,
        options: {
          data: signUpName.trim() ? { full_name: signUpName.trim() } : undefined,
        },
      });
      if (signUpError) throw signUpError;
      const token = data?.session?.access_token;
      if (token) {
        // Redirect to /auth/callback with token and preserve state from URL
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("token", token);
        // Preserve any existing query params (like state, redirectUri) from the original login flow
        const currentParams = new URLSearchParams(window.location.search);
        currentParams.forEach((value, key) => {
          if (key !== "token") {
            callbackUrl.searchParams.set(key, value);
          }
        });
        
        window.location.href = callbackUrl.toString();
        return;
      }
      setSignUpSuccess(true);
      setSignUpEmail("");
      setSignUpPassword("");
      setSignUpConfirm("");
      setSignUpName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  function getAuthCallbackRedirectUrl(): string {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/callback`;
  }

  const handleGoogle = () => {
    setError(null);
    setSignUpSuccess(false);
    const redirectTo = getAuthCallbackRedirectUrl()+window.location.search;
    supabase.auth
      .signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      })
      .then(({ error }) => {
        if (error) setError(error.message);
      });
  };

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col md:flex-row",
        "bg-gradient-to-br from-[#0f0f12] via-[#1a1a24] to-[#0f0f12]",
        "text-white"
      )}
    >
      {/* Left: branding (visible on md+) */}
      <div
        className={cn(
          "hidden md:flex md:w-[44%] lg:w-[50%] flex-col justify-between p-10 lg:p-16",
          "bg-gradient-to-br opacity-20 via-transparent opacity-10"
        )}
        style={{
          background: `linear-gradient(to bottom right, ${primaryColor}20, transparent, ${secondaryColor}10)`,
        }}
      >
        <AuthLogo
          boardName={boardSettings?.boardName}
          logoUrl={boardSettings?.logoUrl}
          boardAbbreviation={boardSettings?.boardAbbreviation}
          primaryColor={primaryColor}
        />
        <div>
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white/95 max-w-md">
            Welcome to {boardName}
          </h1>
          <p className="mt-4 text-lg text-white/60 max-w-sm leading-relaxed">
            {tagline || "Sign in to access your account and get started."}
          </p>
        </div>
        <p className="text-sm text-white/40">
          © {new Date().getFullYear()} {boardName}
        </p>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div
          className={cn(
            "w-full max-w-[420px] rounded-2xl border border-white/10",
            "bg-white/5 backdrop-blur-xl shadow-2xl",
            "p-8 md:p-10"
          )}
        >
          <div className="md:hidden mb-8">
            <AuthLogo
              boardName={boardSettings?.boardName}
              logoUrl={boardSettings?.logoUrl}
              boardAbbreviation={boardSettings?.boardAbbreviation}
              primaryColor={primaryColor}
            />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Sign in or create an account to continue.
            </p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList
              className={cn(
                "w-full grid grid-cols-2 h-11 rounded-xl p-1",
                "bg-white/10 border border-white/10"
              )}
            >
              <TabsTrigger
                value="signin"
                className={cn(
                  "rounded-lg text-sm font-medium data-[state=active]:bg-white/15 data-[state=active]:text-white",
                  "text-white/70 data-[state=inactive]:hover:text-white/90"
                )}
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className={cn(
                  "rounded-lg text-sm font-medium data-[state=active]:bg-white/15 data-[state=active]:text-white",
                  "text-white/70 data-[state=inactive]:hover:text-white/90"
                )}
              >
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6 space-y-5">
              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="signin-email"
                    className="text-white/80 text-sm font-medium"
                  >
                    Email
                  </Label>
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className={cn(
                      "h-11 rounded-lg bg-white/5 border-white/15 text-white placeholder:text-white/40",
                      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={{
                      "--tw-ring-color": `${primaryColor}50`,
                    } as React.CSSProperties & { "--tw-ring-color": string }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${primaryColor}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="signin-password"
                    className="text-white/80 text-sm font-medium"
                  >
                    Password
                  </Label>
                  <Input
                    id="signin-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className={cn(
                      "h-11 rounded-lg bg-white/5 border-white/15 text-white placeholder:text-white/40",
                      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={{
                      "--tw-ring-color": `${primaryColor}50`,
                    } as React.CSSProperties & { "--tw-ring-color": string }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${primaryColor}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "w-full h-11 rounded-lg font-semibold text-white hover:opacity-90 shadow-lg"
                  )}
                  style={{
                    background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
                    boxShadow: `${primaryColor}40 0 10px 20px`,
                  }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-5">
              {signUpSuccess && (
                <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  Account created. Check your email to confirm, then sign in.
                </p>
              )}
              {error && !signUpSuccess && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="signup-name"
                    className="text-white/80 text-sm font-medium"
                  >
                    Name (optional)
                  </Label>
                  <Input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={signUpName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSignUpName(e.target.value)}
                    disabled={loading}
                    className={cn(
                      "h-11 rounded-lg bg-white/5 border-white/15 text-white placeholder:text-white/40",
                      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={{
                      "--tw-ring-color": `${primaryColor}50`,
                    } as React.CSSProperties & { "--tw-ring-color": string }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${primaryColor}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="signup-email"
                    className="text-white/80 text-sm font-medium"
                  >
                    Email
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={signUpEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSignUpEmail(e.target.value)}
                    required
                    disabled={loading}
                    className={cn(
                      "h-11 rounded-lg bg-white/5 border-white/15 text-white placeholder:text-white/40",
                      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={{
                      "--tw-ring-color": `${primaryColor}50`,
                    } as React.CSSProperties & { "--tw-ring-color": string }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${primaryColor}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="signup-password"
                    className="text-white/80 text-sm font-medium"
                  >
                    Password
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={signUpPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSignUpPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                    className={cn(
                      "h-11 rounded-lg bg-white/5 border-white/15 text-white placeholder:text-white/40",
                      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={{
                      "--tw-ring-color": `${primaryColor}50`,
                    } as React.CSSProperties & { "--tw-ring-color": string }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${primaryColor}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="signup-confirm"
                    className="text-white/80 text-sm font-medium"
                  >
                    Confirm password
                  </Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={signUpConfirm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSignUpConfirm(e.target.value)}
                    required
                    disabled={loading}
                    className={cn(
                      "h-11 rounded-lg bg-white/5 border-white/15 text-white placeholder:text-white/40",
                      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={{
                      "--tw-ring-color": `${primaryColor}50`,
                    } as React.CSSProperties & { "--tw-ring-color": string }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${primaryColor}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}40`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "w-full h-11 rounded-lg font-semibold text-white hover:opacity-90 shadow-lg"
                  )}
                  style={{
                    background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
                    boxShadow: `${primaryColor}40 0 10px 20px`,
                  }}
                >
                  {loading ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <div className="relative">
              <span className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/15" />
              </span>
              <span className="relative flex justify-center text-xs uppercase tracking-wider text-white/45">
                or continue with
              </span>
            </div>
            <Button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className={cn(
                "w-full h-11 mt-5 rounded-lg font-medium",
                "bg-white/10 border border-white/15 text-white hover:bg-white/15",
                "flex items-center justify-center gap-2"
              )}
            >
              <GoogleIcon />
              Google
            </Button>
          </div>

          <p className="mt-8 text-center">
            <a
              href="/"
              className="text-sm text-white/55 hover:text-white/80 transition-colors"
            >
              ← Back to home
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
