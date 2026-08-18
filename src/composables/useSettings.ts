import { reactive, watch } from "vue";

export const LONG_BREAK_INTERVAL = 4;

export type InterventionMode = "warning" | "block";

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  autoStartWork: boolean;
  autoStartBreaks: boolean;
  blocklist: string[];
  ignoredApps: string[];
  interventionMode: InterventionMode;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStartWork: false,
  autoStartBreaks: false,
  blocklist: ["twitter.com", "instagram.com", "netflix.com"],
  ignoredApps: ["cursor", "code", "antigravity"],
  interventionMode: "warning",
};

const STORAGE_KEY = "chronoward.settings";
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;

export function clampMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

function parseStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const items = value.map((item) => String(item).trim()).filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

function cloneDefaults(): PomodoroSettings {
  return {
    ...DEFAULT_SETTINGS,
    blocklist: [...DEFAULT_SETTINGS.blocklist],
    ignoredApps: [...DEFAULT_SETTINGS.ignoredApps],
  };
}

function loadSettings(): PomodoroSettings {
  if (typeof localStorage === "undefined") {
    return cloneDefaults();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneDefaults();
    }

    const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
    return {
      workMinutes: clampMinutes(
        Number(parsed.workMinutes),
        DEFAULT_SETTINGS.workMinutes,
      ),
      shortBreakMinutes: clampMinutes(
        Number(parsed.shortBreakMinutes),
        DEFAULT_SETTINGS.shortBreakMinutes,
      ),
      longBreakMinutes: clampMinutes(
        Number(parsed.longBreakMinutes),
        DEFAULT_SETTINGS.longBreakMinutes,
      ),
      autoStartWork: Boolean(parsed.autoStartWork),
      autoStartBreaks: Boolean(parsed.autoStartBreaks),
      blocklist: parseStringList(parsed.blocklist, DEFAULT_SETTINGS.blocklist),
      ignoredApps: parseStringList(
        parsed.ignoredApps,
        DEFAULT_SETTINGS.ignoredApps,
      ),
      interventionMode:
        parsed.interventionMode === "block" ? "block" : "warning",
    };
  } catch {
    return cloneDefaults();
  }
}

export const settings = reactive<PomodoroSettings>(loadSettings());

watch(
  settings,
  (value) => {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

export function parseListInput(text: string, fallback: string[]): string[] {
  const items = text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

export function useSettings() {
  return {
    settings,
    LONG_BREAK_INTERVAL,
    clampMinutes,
    parseListInput,
    DEFAULT_SETTINGS,
  };
}
