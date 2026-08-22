import { computed, ref, watch } from "vue";
import { listen } from "@tauri-apps/api/event";
import { addPluginListener } from "@tauri-apps/api/core";
import { LONG_BREAK_INTERVAL, settings } from "./useSettings";
import {
  cancelExactPreAlert,
  notifyUser,
  scheduleExactPreAlert,
} from "./useNotify";
import {
  clearOngoingNotification,
  startOngoingNotification,
  updateOngoingNotification,
} from "./useOngoingNotification";
import { logSessionComplete } from "./useSessionHistory";
import { useTasks } from "./useTasks";

export type PomodoroPhase = "idle" | "work" | "shortBreak" | "longBreak";
export type PomodoroTab = "work" | "shortBreak" | "longBreak";

const PRE_ALERT_SECONDS = 60;
const TICK_MS = 200;
const TIMER_STORAGE_KEY = "chronoward.timer";
const CATCH_UP_GUARD = 24;

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  idle: "Idle",
  work: "Work",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

interface TimerSnapshot {
  version: 1;
  phase: PomodoroPhase;
  isRunning: boolean;
  /** Wall-clock end while running; 0 when paused/idle. */
  targetEndMs: number;
  remainingSeconds: number;
  sessionDurationSeconds: number;
  completedWorkCount: number;
  focusedSecondsCompleted: number;
  preAlertFired: boolean;
}

const phase = ref<PomodoroPhase>("idle");
const isRunning = ref(false);
const remainingSeconds = ref(settings.workMinutes * 60);
const completedWorkCount = ref(0);
const focusedSecondsCompleted = ref(0);

let intervalId: ReturnType<typeof setInterval> | null = null;
let targetEndMs = 0;
let preAlertFired = false;
let nativePreAlertArmed = false;
let nativePreAlertEpoch = 0;
const sessionTotalSeconds = ref(settings.workMinutes * 60);
/** Suppress phase-start notifications while replaying missed time after kill. */
let suppressPhaseNotify = false;

const isAndroidRuntime = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

const ADD_FIVE_MINUTES_SECONDS = 300;
const ADD_FIVE_MINUTES_MS = 300_000;

let notificationActionStarted = false;
let hydrated = false;

function isPomodoroPhase(value: unknown): value is PomodoroPhase {
  return (
    value === "idle" ||
    value === "work" ||
    value === "shortBreak" ||
    value === "longBreak"
  );
}

function clearTimerSnapshot() {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(TIMER_STORAGE_KEY);
}

function persistTimerSnapshot() {
  if (typeof localStorage === "undefined" || !hydrated) {
    return;
  }
  if (phase.value === "idle") {
    clearTimerSnapshot();
    return;
  }
  const snapshot: TimerSnapshot = {
    version: 1,
    phase: phase.value,
    isRunning: isRunning.value,
    targetEndMs: isRunning.value ? targetEndMs : 0,
    remainingSeconds: remainingSeconds.value,
    sessionDurationSeconds: sessionTotalSeconds.value,
    completedWorkCount: completedWorkCount.value,
    focusedSecondsCompleted: focusedSecondsCompleted.value,
    preAlertFired,
  };
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot));
}

function loadTimerSnapshot(): TimerSnapshot | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<TimerSnapshot>;
    if (parsed.version !== 1 || !isPomodoroPhase(parsed.phase)) {
      return null;
    }
    if (parsed.phase === "idle") {
      return null;
    }
    return {
      version: 1,
      phase: parsed.phase,
      isRunning: Boolean(parsed.isRunning),
      targetEndMs: Number(parsed.targetEndMs) || 0,
      remainingSeconds: Math.max(0, Number(parsed.remainingSeconds) || 0),
      sessionDurationSeconds: Math.max(
        1,
        Number(parsed.sessionDurationSeconds) ||
          durationSecondsFor(parsed.phase),
      ),
      completedWorkCount: Math.max(0, Number(parsed.completedWorkCount) || 0),
      focusedSecondsCompleted: Math.max(
        0,
        Number(parsed.focusedSecondsCompleted) || 0,
      ),
      preAlertFired: Boolean(parsed.preAlertFired),
    };
  } catch {
    return null;
  }
}

function nativeTitle(): string {
  return `Chronoward - ${PHASE_LABELS[phase.value]}`;
}

function nativeArgs(isPaused: boolean) {
  return {
    title: nativeTitle(),
    remainingSeconds: remainingSeconds.value,
    isPaused,
    sessionType: phase.value,
  };
}

function syncNativeStart() {
  if (phase.value === "idle") {
    void clearOngoingNotification();
    return;
  }
  void startOngoingNotification(nativeArgs(false));
}

function syncNativeUpdate(isPaused: boolean) {
  if (phase.value === "idle") {
    void clearOngoingNotification();
    return;
  }
  void updateOngoingNotification(nativeArgs(isPaused));
}

function syncNativeClear() {
  void clearOngoingNotification();
}

function parseNotificationAction(payload: unknown): string {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.toLowerCase().startsWith("action=")) {
      return trimmed.slice("action=".length).trim();
    }
    return trimmed;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.action === "string") {
      return record.action;
    }
    if (typeof record.payload === "string") {
      return record.payload;
    }
  }
  return "";
}

function durationSecondsFor(nextPhase: PomodoroPhase): number {
  switch (nextPhase) {
    case "shortBreak":
      return settings.shortBreakMinutes * 60;
    case "longBreak":
      return settings.longBreakMinutes * 60;
    case "idle":
    case "work":
      return settings.workMinutes * 60;
  }
}

function clearTick() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function disarmNativePreAlert() {
  nativePreAlertEpoch += 1;
  nativePreAlertArmed = false;
  void cancelExactPreAlert();
}

function armNativePreAlert() {
  const epoch = ++nativePreAlertEpoch;
  if (!isAndroidRuntime || phase.value === "idle") {
    nativePreAlertArmed = false;
    void cancelExactPreAlert();
    return;
  }
  const delayMs = (remainingSeconds.value - PRE_ALERT_SECONDS) * 1000;
  if (delayMs <= 0) {
    nativePreAlertArmed = false;
    void cancelExactPreAlert();
    return;
  }
  void scheduleExactPreAlert(
    delayMs,
    "Chronoward",
    `${PHASE_LABELS[phase.value]} ends in 1 minute.`,
  ).then((armed) => {
    if (epoch !== nativePreAlertEpoch) {
      return;
    }
    nativePreAlertArmed = armed;
  });
}

function emitPreAlert() {
  console.log("[chronoward] pre-alert", {
    phase: phase.value,
    remainingSeconds: remainingSeconds.value,
  });
  if (nativePreAlertArmed) {
    return;
  }
  void notifyUser(
    "Chronoward",
    `${PHASE_LABELS[phase.value]} ends in 1 minute.`,
  );
}

function armPreAlert() {
  if (phase.value === "idle") {
    preAlertFired = true;
    return;
  }

  if (remainingSeconds.value < PRE_ALERT_SECONDS) {
    preAlertFired = true;
    return;
  }

  preAlertFired = false;
  if (remainingSeconds.value === PRE_ALERT_SECONDS) {
    emitPreAlert();
    preAlertFired = true;
  }
}

function maybePreAlert(previousSeconds: number, nextSeconds: number) {
  if (preAlertFired || phase.value === "idle") {
    return;
  }
  if (previousSeconds > PRE_ALERT_SECONDS && nextSeconds <= PRE_ALERT_SECONDS) {
    emitPreAlert();
    preAlertFired = true;
  }
}

function tick() {
  const nextSeconds = Math.max(0, Math.ceil((targetEndMs - Date.now()) / 1000));
  maybePreAlert(remainingSeconds.value, nextSeconds);
  remainingSeconds.value = nextSeconds;

  if (nextSeconds === 0) {
    completeCurrent();
  }
}

function startTicking(fromResume = false, preserveTarget = false) {
  clearTick();
  if (!preserveTarget) {
    targetEndMs = Date.now() + remainingSeconds.value * 1000;
  }
  isRunning.value = true;
  intervalId = setInterval(tick, TICK_MS);
  armNativePreAlert();
  if (fromResume) {
    syncNativeUpdate(false);
  } else {
    syncNativeStart();
  }
  persistTimerSnapshot();
}

function enterPhase(nextPhase: PomodoroPhase, autoRun: boolean) {
  clearTick();
  phase.value = nextPhase;
  sessionTotalSeconds.value = durationSecondsFor(nextPhase);
  remainingSeconds.value = sessionTotalSeconds.value;
  isRunning.value = false;
  armPreAlert();

  if (!suppressPhaseNotify) {
    if (nextPhase === "work") {
      void notifyUser("Chronoward", "Focus session started. Stay on task.");
    } else if (nextPhase === "shortBreak") {
      void notifyUser("Chronoward", "Short break started.");
    } else if (nextPhase === "longBreak") {
      void notifyUser("Chronoward", "Long break started.");
    }
  }

  if (autoRun && nextPhase !== "idle") {
    startTicking();
  } else {
    disarmNativePreAlert();
    syncNativeClear();
    persistTimerSnapshot();
  }
}

function nextBreakPhase(): PomodoroPhase {
  if (completedWorkCount.value % LONG_BREAK_INTERVAL === 0) {
    return "longBreak";
  }
  return "shortBreak";
}

/**
 * After a kill/background, replay auto-start chain from a past phase end
 * so we land on the phase that should be active *now*, not a fresh full duration.
 */
function catchUpFromExpiredEnd(phaseEndedAtMs: number) {
  clearTick();
  isRunning.value = false;
  let cursor = phaseEndedAtMs;
  const now = Date.now();
  suppressPhaseNotify = true;

  try {
    for (let i = 0; i < CATCH_UP_GUARD; i += 1) {
      if (phase.value === "work") {
        focusedSecondsCompleted.value += sessionTotalSeconds.value;
        completedWorkCount.value += 1;
        const next = nextBreakPhase();
        if (!settings.autoStartBreaks) {
          enterPhase("idle", false);
          return;
        }
        phase.value = next;
        sessionTotalSeconds.value = durationSecondsFor(next);
      } else if (phase.value === "shortBreak" || phase.value === "longBreak") {
        if (!settings.autoStartWork) {
          enterPhase("idle", false);
          return;
        }
        phase.value = "work";
        sessionTotalSeconds.value = durationSecondsFor("work");
      } else {
        enterPhase("idle", false);
        return;
      }

      const nextEnd = cursor + sessionTotalSeconds.value * 1000;
      if (nextEnd > now) {
        targetEndMs = nextEnd;
        remainingSeconds.value = Math.max(
          0,
          Math.ceil((nextEnd - now) / 1000),
        );
        preAlertFired = remainingSeconds.value < PRE_ALERT_SECONDS;
        startTicking(true, true);
        return;
      }

      remainingSeconds.value = 0;
      cursor = nextEnd;
    }

    enterPhase("idle", false);
  } finally {
    suppressPhaseNotify = false;
  }
}

function logCompletedPhase() {
  if (phase.value !== "work" && phase.value !== "shortBreak" && phase.value !== "longBreak") {
    return;
  }
  const elapsed = Math.max(0, sessionTotalSeconds.value - remainingSeconds.value);
  const durationSeconds = elapsed > 0 ? elapsed : sessionTotalSeconds.value;
  const { activeTask } = useTasks();
  logSessionComplete({
    kind: phase.value,
    durationSeconds,
    taskTitle: phase.value === "work" ? activeTask.value?.title : undefined,
  });
}

function completeCurrent() {
  logCompletedPhase();

  if (phase.value === "work") {
    const elapsed = Math.max(0, sessionTotalSeconds.value - remainingSeconds.value);
    focusedSecondsCompleted.value += elapsed;
    completedWorkCount.value += 1;
    enterPhase(nextBreakPhase(), settings.autoStartBreaks);
    return;
  }

  if (phase.value === "shortBreak" || phase.value === "longBreak") {
    if (settings.autoStartWork) {
      enterPhase("work", true);
    } else {
      enterPhase("idle", false);
    }
  }
}

function start() {
  if (phase.value === "idle") {
    enterPhase("work", true);
    return;
  }
  if (!isRunning.value && remainingSeconds.value > 0) {
    startTicking(true);
  }
}

function pause() {
  if (!isRunning.value) {
    return;
  }

  const nextSeconds = Math.max(0, Math.ceil((targetEndMs - Date.now()) / 1000));
  maybePreAlert(remainingSeconds.value, nextSeconds);
  remainingSeconds.value = nextSeconds;

  if (nextSeconds === 0) {
    completeCurrent();
    return;
  }

  clearTick();
  isRunning.value = false;
  targetEndMs = 0;
  disarmNativePreAlert();
  syncNativeUpdate(true);
  persistTimerSnapshot();
}

function toggle() {
  if (isRunning.value) {
    pause();
    return;
  }
  start();
}

function skip() {
  if (phase.value === "idle") {
    return;
  }
  completeCurrent();
}

function addFiveMinutes() {
  if (phase.value === "idle") {
    return;
  }
  if (isRunning.value) {
    remainingSeconds.value = Math.max(
      0,
      Math.ceil((targetEndMs - Date.now()) / 1000),
    );
  }
  remainingSeconds.value += ADD_FIVE_MINUTES_SECONDS;
  sessionTotalSeconds.value += ADD_FIVE_MINUTES_SECONDS;
  if (isRunning.value) {
    targetEndMs += ADD_FIVE_MINUTES_MS;
  }
  preAlertFired = false;
  armPreAlert();
  if (isRunning.value) {
    armNativePreAlert();
    syncNativeStart();
  } else {
    syncNativeUpdate(true);
  }
  persistTimerSnapshot();
}

function reset() {
  completedWorkCount.value = 0;
  focusedSecondsCompleted.value = 0;
  enterPhase("idle", false);
}

function selectPhase(tab: PomodoroTab) {
  const wasRunning = isRunning.value;
  clearTick();
  disarmNativePreAlert();
  phase.value = tab;
  sessionTotalSeconds.value = durationSecondsFor(tab);
  remainingSeconds.value = sessionTotalSeconds.value;
  preAlertFired = false;
  armPreAlert();

  if (wasRunning) {
    startTicking();
    return;
  }

  isRunning.value = false;
  targetEndMs = 0;
  syncNativeUpdate(true);
  persistTimerSnapshot();
}

function catchUpAfterResume() {
  if (!isRunning.value || phase.value === "idle") {
    return;
  }
  const now = Date.now();
  if (now >= targetEndMs) {
    const endedAt = targetEndMs;
    remainingSeconds.value = 0;
    catchUpFromExpiredEnd(endedAt);
    return;
  }
  const nextSeconds = Math.max(0, Math.ceil((targetEndMs - now) / 1000));
  maybePreAlert(remainingSeconds.value, nextSeconds);
  remainingSeconds.value = nextSeconds;
  persistTimerSnapshot();
}

function hydrateTimerFromStorage() {
  const snap = loadTimerSnapshot();
  hydrated = true;
  if (!snap) {
    return;
  }

  phase.value = snap.phase;
  sessionTotalSeconds.value = snap.sessionDurationSeconds;
  completedWorkCount.value = snap.completedWorkCount;
  focusedSecondsCompleted.value = snap.focusedSecondsCompleted;
  preAlertFired = snap.preAlertFired;

  if (!snap.isRunning) {
    remainingSeconds.value = snap.remainingSeconds;
    isRunning.value = false;
    targetEndMs = 0;
    persistTimerSnapshot();
    return;
  }

  if (!snap.targetEndMs || snap.targetEndMs <= 0) {
    remainingSeconds.value = snap.remainingSeconds;
    isRunning.value = false;
    persistTimerSnapshot();
    return;
  }

  const now = Date.now();
  if (now >= snap.targetEndMs) {
    remainingSeconds.value = 0;
    isRunning.value = false;
    targetEndMs = snap.targetEndMs;
    catchUpFromExpiredEnd(snap.targetEndMs);
    return;
  }

  targetEndMs = snap.targetEndMs;
  remainingSeconds.value = Math.max(
    0,
    Math.ceil((snap.targetEndMs - now) / 1000),
  );
  startTicking(true, true);
}

function dispatchNotificationAction(payload: unknown) {
  if (!settings.showOngoingTimerNotification) {
    return;
  }
  const action = parseNotificationAction(payload)
    .toLowerCase()
    .replace(/-/g, "_");
  switch (action) {
    case "pause":
      pause();
      return;
    case "resume":
      start();
      return;
    case "skip":
      skip();
      return;
    case "add_5m":
    case "add_time":
    case "addtime":
      addFiveMinutes();
      return;
    case "stop":
    case "reset":
      reset();
      return;
    default:
      if (action) {
        console.log("[chronoward] unknown notification-action", action);
      }
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      persistTimerSnapshot();
      return;
    }
    if (document.visibilityState === "visible") {
      catchUpAfterResume();
    }
  });
  window.addEventListener("pagehide", () => {
    persistTimerSnapshot();
  });
}

function startNotificationActionListener() {
  if (notificationActionStarted) {
    return;
  }
  notificationActionStarted = true;

  void listen("notification-action", (event) => {
    dispatchNotificationAction(event.payload);
  }).catch(() => {
    notificationActionStarted = false;
  });

  void addPluginListener(
    "chronoward-tracking",
    "notification-action",
    (payload) => {
      dispatchNotificationAction(payload);
    },
  ).catch(() => {
    // plugin listener is expected to fail on desktop
  });
}

watch(
  () => settings.workMinutes,
  () => {
    if (phase.value === "idle" && !isRunning.value) {
      sessionTotalSeconds.value = durationSecondsFor("idle");
      remainingSeconds.value = sessionTotalSeconds.value;
    }
  },
);

watch(
  () => settings.showOngoingTimerNotification,
  (enabled) => {
    if (!enabled) {
      syncNativeClear();
      return;
    }
    if (phase.value === "idle") {
      return;
    }
    if (isRunning.value) {
      syncNativeStart();
      return;
    }
    syncNativeUpdate(true);
  },
);

const formattedTime = computed(() => {
  const clamped = Math.max(0, remainingSeconds.value);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
});

const phaseLabel = computed(() => PHASE_LABELS[phase.value]);

const sessionInCycle = computed(() => {
  if (phase.value === "shortBreak" || phase.value === "longBreak") {
    const remainder = completedWorkCount.value % LONG_BREAK_INTERVAL;
    return remainder === 0 ? LONG_BREAK_INTERVAL : remainder;
  }
  return (completedWorkCount.value % LONG_BREAK_INTERVAL) + 1;
});

const canSkip = computed(() => phase.value !== "idle");

const sessionProgress = computed(() => {
  if (sessionTotalSeconds.value <= 0) {
    return 0;
  }
  return Math.min(
    1,
    Math.max(0, remainingSeconds.value / sessionTotalSeconds.value),
  );
});

const focusSecondsToday = computed(() => {
  if (phase.value === "work") {
    const elapsed = Math.max(0, sessionTotalSeconds.value - remainingSeconds.value);
    return focusedSecondsCompleted.value + elapsed;
  }
  return focusedSecondsCompleted.value;
});

const nextBreakKind = computed(() => {
  if (phase.value === "shortBreak") {
    return "Short break";
  }
  if (phase.value === "longBreak") {
    return "Long break";
  }
  if (phase.value === "work") {
    return sessionInCycle.value === LONG_BREAK_INTERVAL
      ? "Long break"
      : "Short break";
  }
  const nextWorkSlot = (completedWorkCount.value % LONG_BREAK_INTERVAL) + 1;
  return nextWorkSlot === LONG_BREAK_INTERVAL ? "Long break" : "Short break";
});

const activeTab = computed((): PomodoroTab => {
  if (phase.value === "shortBreak") {
    return "shortBreak";
  }
  if (phase.value === "longBreak") {
    return "longBreak";
  }
  return "work";
});

const canAddFiveMinutes = computed(
  () => phase.value !== "idle" && (isRunning.value || remainingSeconds.value > 0),
);

hydrateTimerFromStorage();

export function usePomodoro() {
  startNotificationActionListener();
  return {
    phase,
    phaseLabel,
    isRunning,
    remainingSeconds,
    sessionTotalSeconds,
    formattedTime,
    completedWorkCount,
    sessionInCycle,
    canSkip,
    canAddFiveMinutes,
    sessionProgress,
    focusSecondsToday,
    nextBreakKind,
    activeTab,
    start,
    pause,
    toggle,
    skip,
    addFiveMinutes,
    selectPhase,
    reset,
  };
}
