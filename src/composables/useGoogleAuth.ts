import { invoke } from "@tauri-apps/api/core";
import { onMounted, onUnmounted, ref } from "vue";
import { runDriveSync } from "./useDriveSync";

export type GoogleAuthStatus = {
  configured: boolean;
  signedIn: boolean;
  email: string | null;
  sub: string | null;
  nextStep: string;
  serverClientId: string | null;
  androidClientId: string | null;
  desktopClientSuspect: boolean;
  needsDriveConsent: boolean;
  lastSyncAt: string | null;
};

const isAndroid = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

function formatError(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Google sign-in is not available yet.";
}

function isCancelledMessage(message: string): boolean {
  return /cancel+ed/i.test(message);
}

export function useGoogleAuth() {
  const status = ref<GoogleAuthStatus | null>(null);
  const busy = ref(false);
  const errorMessage = ref("");
  const cancelled = ref(false);
  let active = true;

  async function refresh() {
    try {
      status.value = await invoke<GoogleAuthStatus>("google_auth_status");
    } catch (error) {
      errorMessage.value = formatError(error);
    }
  }

  async function cancelSignIn() {
    try {
      await invoke("google_cancel_sign_in");
    } catch {
      busy.value = false;
    }
  }

  async function signIn() {
    busy.value = true;
    errorMessage.value = "";
    cancelled.value = false;
    try {
      if (isAndroid) {
        const current = status.value ?? (await invoke<GoogleAuthStatus>("google_auth_status"));
        if (!current.configured || !current.serverClientId) {
          throw new Error(current.nextStep || "Google OAuth is not configured.");
        }
        const result = await invoke<{ sub: string; email?: string }>(
          "plugin:chronoward-tracking|google_sign_in",
          {
            serverClientId: current.serverClientId,
            androidClientId: current.androidClientId ?? "",
          },
        );
        await invoke("google_complete_sign_in", {
          payload: {
            sub: result.sub,
            email: result.email ?? null,
          },
        });
      } else {
        await invoke("google_sign_in");
      }
      if (!active) {
        return;
      }
      await refresh();
      try {
        await runDriveSync();
        await refresh();
      } catch (syncError) {
        if (!active) {
          return;
        }
        errorMessage.value = formatError(syncError);
      }
    } catch (error) {
      if (!active) {
        return;
      }
      const message = formatError(error);
      if (isCancelledMessage(message)) {
        cancelled.value = true;
        errorMessage.value = "";
      } else {
        errorMessage.value = message;
      }
    } finally {
      if (active) {
        busy.value = false;
      }
    }
  }

  async function signOut() {
    busy.value = true;
    errorMessage.value = "";
    cancelled.value = false;
    try {
      await invoke("google_sign_out");
      await refresh();
    } catch (error) {
      errorMessage.value = formatError(error);
    } finally {
      busy.value = false;
    }
  }

  onMounted(() => {
    void refresh();
  });

  onUnmounted(() => {
    active = false;
    void cancelSignIn();
  });

  return { status, busy, errorMessage, cancelled, refresh, signIn, cancelSignIn, signOut };
}
