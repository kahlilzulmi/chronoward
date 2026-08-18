import { reactive, watch } from "vue";

export const LONG_BREAK_INTERVAL = 4;

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  autoStartWork: boolean;
  autoStartBreaks: boolean;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStartWork: false,
  autoStartBreaks: false,
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

function loadSettings(): PomodoroSettings {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
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
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
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

export function useSettings() {
  return {
    settings,
    LONG_BREAK_INTERVAL,
    clampMinutes,
    DEFAULT_SETTINGS,
  };
}
