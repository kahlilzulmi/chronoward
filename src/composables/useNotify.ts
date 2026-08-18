import { invoke } from "@tauri-apps/api/core";

let permissionChecked = false;
let permissionGranted = false;
let lastPermissionError = "";

const isAndroid = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

function formatInvokeError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getLastNotificationError(): string {
  return lastPermissionError;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionChecked) {
    return permissionGranted;
  }
  try {
    // Invoke the plugin directly. Do not use window.Notification: Android WebView
    // often reports permission "denied" without ever showing POST_NOTIFICATIONS.
    const current = await invoke<boolean | null>(
      "plugin:notification|is_permission_granted",
    );
    if (current === true) {
      lastPermissionError = "";
      permissionChecked = true;
      permissionGranted = true;
      return true;
    }
    const state = await invoke<string>("plugin:notification|request_permission");
    const granted = state === "granted";
    permissionChecked = true;
    permissionGranted = granted;
    if (!granted) {
      lastPermissionError = `native permission state: ${state}`;
      console.log("[chronoward] notification permission not granted", state);
    } else {
      lastPermissionError = "";
    }
    return granted;
  } catch (error) {
    lastPermissionError = formatInvokeError(error);
    console.error(
      "[chronoward] notification permission invoke failed",
      lastPermissionError,
      error,
    );
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  permissionChecked = false;
  return ensureNotificationPermission();
}

export async function notifyUser(title: string, body: string): Promise<boolean> {
  const granted = await ensureNotificationPermission();
  if (!granted) {
    console.log(
      "[chronoward] notification unavailable",
      title,
      body,
      lastPermissionError || "permission not granted",
    );
    return false;
  }
  try {
    await invoke("plugin:notification|notify", {
      options: { title, body },
    });
    return true;
  } catch (error) {
    lastPermissionError = formatInvokeError(error);
    console.error("[chronoward] notification failed", lastPermissionError, error);
    return false;
  }
}

export async function testNotification(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    console.log(
      "[chronoward] notification permission denied",
      lastPermissionError || "permission not granted",
    );
    return false;
  }
  return notifyUser(
    "Chronoward",
    "Test notification. Work and break transitions will use this same channel.",
  );
}

export async function scheduleExactPreAlert(
  delayMs: number,
  title: string,
  body: string,
): Promise<boolean> {
  if (!isAndroid || delayMs <= 0) {
    return false;
  }
  try {
    await invoke("plugin:chronoward-tracking|schedule_exact_alarm", {
      delayMs,
      notificationTitle: title,
      notificationBody: body,
    });
    return true;
  } catch (error) {
    console.error(
      "[chronoward] exact alarm schedule failed",
      formatInvokeError(error),
      error,
    );
    return false;
  }
}

export async function cancelExactPreAlert(): Promise<void> {
  if (!isAndroid) {
    return;
  }
  try {
    await invoke("plugin:chronoward-tracking|cancel_exact_alarm");
  } catch (error) {
    console.log(
      "[chronoward] exact alarm cancel skipped",
      formatInvokeError(error),
    );
  }
}
