import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const API = import.meta.env.VITE_API || "http://localhost:3000";

export async function apiFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
