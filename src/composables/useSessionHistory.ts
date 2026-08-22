import { ref } from "vue";

export type SessionKind = "work" | "shortBreak" | "longBreak";

export interface SessionRecord {
  id: string;
  kind: SessionKind;
  completedAt: number;
  durationSeconds: number;
  taskTitle?: string;
}

const STORAGE_KEY = "chronoward.sessions";

function loadRecords(): SessionRecord[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SessionRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (row) =>
        row &&
        typeof row.id === "string" &&
        typeof row.completedAt === "number" &&
        typeof row.durationSeconds === "number",
    );
  } catch {
    return [];
  }
}

function saveRecords(records: SessionRecord[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 500)));
}

const records = ref<SessionRecord[]>(loadRecords());

export { records };

export function logSessionComplete(entry: {
  kind: SessionKind;
  durationSeconds: number;
  taskTitle?: string;
}) {
  const durationSeconds = Math.max(0, Math.floor(entry.durationSeconds));
  if (durationSeconds <= 0) {
    return;
  }
  records.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: entry.kind,
    completedAt: Date.now(),
    durationSeconds,
    taskTitle: entry.taskTitle?.trim() || undefined,
  });
  saveRecords(records.value);
}

function startOfTodayMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

export function getSessionsForToday(): SessionRecord[] {
  const start = startOfTodayMs();
  return records.value.filter((row) => row.completedAt >= start);
}

export function formatSessionKind(kind: SessionKind): string {
  switch (kind) {
    case "work":
      return "Focus";
    case "shortBreak":
      return "Short break";
    case "longBreak":
      return "Long break";
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatTimeOfDay(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
