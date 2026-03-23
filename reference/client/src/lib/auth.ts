
const API_BASE = "";

export async function sendSessionToServer(
  accessToken: string
): Promise<{ ok: boolean; redirect?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/supabase-callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Session failed");
  return data;
}
