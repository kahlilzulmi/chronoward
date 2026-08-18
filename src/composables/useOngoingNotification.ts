import { invoke } from "@tauri-apps/api/core";
import { settings } from "./useSettings";

const isAndroid = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);
const isWindows = /windows/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

export interface OngoingNotificationArgs {
  title: string;
  remainingSeconds: number;
  isPaused: boolean;
  sessionType: string;
}

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

export async function startOngoingNotification(
  args: OngoingNotificationArgs,
): Promise<void> {
  if (!settings.showOngoingTimerNotification) {
    return;
  }
  try {
    if (isAndroid) {
      await invoke("plugin:chronoward-tracking|start_ongoing_notification", {
        title: args.title,
        remainingSeconds: args.remainingSeconds,
        isPaused: args.isPaused,
        sessionType: args.sessionType,
      });
      return;
    }
    if (!isWindows) {
      return;
    }
    await invoke("show_windows_timer_toast", {
      sessionType: args.sessionType,
      remainingSeconds: args.remainingSeconds,
      isPaused: args.isPaused,
      session_type: args.sessionType,
      remaining_seconds: args.remainingSeconds,
      is_paused: args.isPaused,
    });
  } catch (error) {
    console.log(
      "[chronoward] ongoing notification start skipped",
      formatInvokeError(error),
    );
  }
}

export async function updateOngoingNotification(
  args: OngoingNotificationArgs,
): Promise<void> {
  if (!settings.showOngoingTimerNotification) {
    return;
  }
  try {
    if (isAndroid) {
      await invoke("plugin:chronoward-tracking|update_notification_state", {
        isPaused: args.isPaused,
        remainingSeconds: args.remainingSeconds,
      });
      return;
    }
    if (!isWindows) {
      return;
    }
    await invoke("show_windows_timer_toast", {
      sessionType: args.sessionType,
      remainingSeconds: args.remainingSeconds,
      isPaused: args.isPaused,
      session_type: args.sessionType,
      remaining_seconds: args.remainingSeconds,
      is_paused: args.isPaused,
    });
  } catch (error) {
    console.log(
      "[chronoward] ongoing notification update skipped",
      formatInvokeError(error),
    );
  }
}

export async function clearOngoingNotification(): Promise<void> {
  try {
    if (isAndroid) {
      await invoke("plugin:chronoward-tracking|clear_ongoing_notification");
      return;
    }
    if (!isWindows) {
      return;
    }
    await invoke("clear_windows_toast");
  } catch (error) {
    console.log(
      "[chronoward] ongoing notification clear skipped",
      formatInvokeError(error),
    );
  }
}
