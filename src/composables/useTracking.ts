import { onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "./useSettings";

const DURATION_THRESHOLD_SECONDS = 2;

export interface UsageLogPayload {
  app_name: string;
  url: string;
  duration_seconds: number;
  device_type: string;
  timestamp: string;
}

type TrackedContext = {
  app: string;
  url: string;
  device_type: string;
};

let currentContext: TrackedContext | null = null;
let contextStartTime: number | null = null;

function isEmptyContext(context: {
  app_name?: string;
  window_title?: string;
  url?: string;
}): boolean {
  const app = (context.app_name ?? "").trim();
  const title = (context.window_title ?? "").trim();
  const url = (context.url ?? "").trim();
  return !app && !title && !url;
}

function isoNow(): string {
  return new Date().toISOString();
}

export async function saveUsageLog(payload: UsageLogPayload): Promise<void> {
  try {
    await invoke("insert_app_usage", {
      payload: {
        appName: payload.app_name,
        url: payload.url,
        durationSeconds: payload.duration_seconds,
        deviceType: payload.device_type,
        timestamp: payload.timestamp,
      },
    });
  } catch (error) {
    console.error("[chronoward] saveUsageLog failed", error);
  }
}

function maybeSaveSlice(nowMs: number): void {
  if (!currentContext || contextStartTime == null) {
    return;
  }
  const elapsed = (nowMs - contextStartTime) / 1000;
  if (elapsed <= DURATION_THRESHOLD_SECONDS) {
    return;
  }
  void saveUsageLog({
    app_name: currentContext.app,
    url: settings.persistUrls ? currentContext.url : "",
    duration_seconds: Math.floor(elapsed),
    device_type: currentContext.device_type,
    timestamp: isoNow(),
  });
}

export function recordContextChange(context: {
  app_name: string;
  window_title?: string;
  url?: string;
  device_type?: string;
}): void {
  const now = Date.now();
  maybeSaveSlice(now);

  if (isEmptyContext(context)) {
    currentContext = null;
    contextStartTime = null;
    return;
  }

  currentContext = {
    app: context.app_name.trim() || "Unknown",
    url: (context.url ?? "").trim(),
    device_type: context.device_type || "desktop",
  };
  contextStartTime = now;
}

export function flushCurrentSlice(): void {
  maybeSaveSlice(Date.now());
  currentContext = null;
  contextStartTime = null;
}

export function useTracking() {
  onUnmounted(() => {
    flushCurrentSlice();
  });
}
