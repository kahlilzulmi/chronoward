import { computed, ref } from "vue";
import { supabase } from "../database/supabase";

const PLACEHOLDER_HOST = "placeholder.supabase.co";

/** Project API URL must be https://<ref>.supabase.co — not db.<ref>.supabase.co (Postgres). */
export function supabaseUrlIssue(url: string | undefined): string | null {
  if (!url?.trim()) {
    return "VITE_SUPABASE_URL is missing.";
  }
  if (url.includes("YOUR_PROJECT") || url.includes(PLACEHOLDER_HOST)) {
    return "VITE_SUPABASE_URL is still a placeholder.";
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
      return "VITE_SUPABASE_URL uses the database host (db.…). Use Project URL from Settings → API: https://YOUR_REF.supabase.co (no db. prefix).";
    }
    if (!host.endsWith(".supabase.co") && !host.endsWith(".supabase.in")) {
      return "VITE_SUPABASE_URL host should look like YOUR_REF.supabase.co.";
    }
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL.";
  }
  return null;
}

/** Reject service_role / secret keys — they must never ship in VITE_ browser env. */
export function supabaseKeyIssue(key: string | undefined): string | null {
  if (!key?.trim()) {
    return "VITE_SUPABASE_ANON_KEY is missing.";
  }
  if (key === "YOUR_ANON_KEY" || key.includes("placeholder")) {
    return "VITE_SUPABASE_ANON_KEY is still a placeholder.";
  }
  const parts = key.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { role?: string };
    if (json.role === "service_role") {
      return "VITE_SUPABASE_ANON_KEY is the secret service_role key. Use the anon public key from Settings → API (safe for the browser).";
    }
  } catch {
    /* non-JWT keys: leave to Supabase */
  }
  return null;
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    return false;
  }
  if (url.includes("YOUR_PROJECT") || key === "YOUR_ANON_KEY") {
    return false;
  }
  if (url.includes(PLACEHOLDER_HOST)) {
    return false;
  }
  if (supabaseUrlIssue(url) || supabaseKeyIssue(key)) {
    return false;
  }
  return true;
}

const configured = ref(isSupabaseConfigured());
const busy = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");

let listenerStarted = false;
const authRefreshCallbacks = new Set<() => void>();

export function onSupabaseAuthChange(callback: () => void) {
  authRefreshCallbacks.add(callback);
  return () => {
    authRefreshCallbacks.delete(callback);
  };
}

function notifyAuthChange() {
  for (const callback of authRefreshCallbacks) {
    callback();
  }
}

function startAuthListener() {
  if (listenerStarted) {
    return;
  }
  listenerStarted = true;
  supabase.auth.onAuthStateChange(() => {
    notifyAuthChange();
  });
}

startAuthListener();

function formatAuthError(error: unknown): string {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "Cannot reach the binding service. Check your network and restart the app after updating .env.";
  }
  if (error instanceof Error && error.message) {
    if (/secret api key/i.test(error.message)) {
      return "Wrong API key in .env — use the anon public key, not the secret key.";
    }
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Account binding failed.";
}

export function useSupabaseAuth() {
  const isConfigured = computed(() => configured.value);
  const configIssue = computed(
    () =>
      supabaseUrlIssue(import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
      supabaseKeyIssue(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined),
  );

  async function signInWithGoogleIdToken(idToken: string) {
    errorMessage.value = "";
    statusMessage.value = "";
    if (!configured.value) {
      errorMessage.value =
        configIssue.value ||
        "Cloud binding isn’t configured. Add project URL and anon key to .env (see developer docs).";
      return false;
    }
    const token = idToken.trim();
    if (!token) {
      errorMessage.value =
        "Google did not return a token. Try binding again.";
      return false;
    }

    busy.value = true;
    try {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token,
      });
      if (error) {
        errorMessage.value = formatAuthError(error);
        return false;
      }
      if (!data.session) {
        errorMessage.value = "Binding failed — no session returned.";
        return false;
      }
      statusMessage.value = "Account bound.";
      notifyAuthChange();
      return true;
    } catch (error) {
      errorMessage.value = formatAuthError(error);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function signOut() {
    errorMessage.value = "";
    statusMessage.value = "";
    if (!configured.value) {
      return false;
    }
    busy.value = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        errorMessage.value = formatAuthError(error);
        return false;
      }
      statusMessage.value = "Account unbound.";
      notifyAuthChange();
      return true;
    } catch (error) {
      errorMessage.value = formatAuthError(error);
      return false;
    } finally {
      busy.value = false;
    }
  }

  return {
    isConfigured,
    configIssue,
    busy,
    statusMessage,
    errorMessage,
    signInWithGoogleIdToken,
    signOut,
  };
}
