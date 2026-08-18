import { onUnmounted } from "vue";
import Database from "@tauri-apps/plugin-sql";

const DURATION_THRESHOLD_SECONDS = 2;
const DB_PATH = "sqlite:chronoward.db";

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
let dbPromise: Promise<Database> | null = null;

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

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_PATH);
  }
  try {
    return await dbPromise;
  } catch (error) {
    dbPromise = null;
    throw error;
  }
}

export async function saveUsageLog(payload: UsageLogPayload): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      "INSERT INTO app_usage (app_name, url, duration_seconds, device_type, timestamp) VALUES ($1, $2, $3, $4, $5)",
      [
        payload.app_name,
        payload.url,
        payload.duration_seconds,
        payload.device_type,
        payload.timestamp,
      ],
    );
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
    url: currentContext.url,
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
