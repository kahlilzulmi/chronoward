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

export type PomodoroPhase = "idle" | "work" | "shortBreak" | "longBreak";

const PRE_ALERT_SECONDS = 60;
const TICK_MS = 200;

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  idle: "Idle",
  work: "Work",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

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
let sessionDurationSeconds = settings.workMinutes * 60;

const isAndroidRuntime = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

const ADD_FIVE_MINUTES_SECONDS = 300;
const ADD_FIVE_MINUTES_MS = 300_000;

let notificationActionStarted = false;

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

function startTicking(fromResume = false) {
  clearTick();
  targetEndMs = Date.now() + remainingSeconds.value * 1000;
  isRunning.value = true;
  intervalId = setInterval(tick, TICK_MS);
  armNativePreAlert();
  if (fromResume) {
    syncNativeUpdate(false);
  } else {
    syncNativeStart();
  }
}

function enterPhase(nextPhase: PomodoroPhase, autoRun: boolean) {
  clearTick();
  phase.value = nextPhase;
  sessionDurationSeconds = durationSecondsFor(nextPhase);
  remainingSeconds.value = sessionDurationSeconds;
  isRunning.value = false;
  armPreAlert();

  if (nextPhase === "work") {
    void notifyUser("Chronoward", "Focus session started. Stay on task.");
  } else if (nextPhase === "shortBreak") {
    void notifyUser("Chronoward", "Short break started.");
  } else if (nextPhase === "longBreak") {
    void notifyUser("Chronoward", "Long break started.");
  }

  if (autoRun && nextPhase !== "idle") {
    startTicking();
  } else {
    disarmNativePreAlert();
    syncNativeClear();
  }
}

function nextBreakPhase(): PomodoroPhase {
  if (completedWorkCount.value % LONG_BREAK_INTERVAL === 0) {
    return "longBreak";
  }
  return "shortBreak";
}

function completeCurrent() {
  if (phase.value === "work") {
    const elapsed = Math.max(0, sessionDurationSeconds - remainingSeconds.value);
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
  disarmNativePreAlert();
  syncNativeUpdate(true);
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
  targetEndMs += ADD_FIVE_MINUTES_MS;
  preAlertFired = false;
  armPreAlert();
  if (isRunning.value) {
    armNativePreAlert();
    syncNativeStart();
  } else {
    syncNativeUpdate(true);
  }
}

function reset() {
  enterPhase("idle", false);
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

function catchUpAfterResume() {
  if (!isRunning.value || phase.value === "idle") return;
  const now = Date.now();
  if (now >= targetEndMs) {
    remainingSeconds.value = 0;
    completeCurrent();
    return;
  }
  const nextSeconds = Math.max(0, Math.ceil((targetEndMs - now) / 1000));
  maybePreAlert(remainingSeconds.value, nextSeconds);
  remainingSeconds.value = nextSeconds;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      catchUpAfterResume();
    }
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
      sessionDurationSeconds = durationSecondsFor("idle");
      remainingSeconds.value = sessionDurationSeconds;
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
  if (sessionDurationSeconds <= 0) {
    return 0;
  }
  return Math.min(
    1,
    Math.max(0, remainingSeconds.value / sessionDurationSeconds),
  );
});

const focusSecondsToday = computed(() => {
  if (phase.value === "work") {
    const elapsed = Math.max(0, sessionDurationSeconds - remainingSeconds.value);
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

export function usePomodoro() {
  startNotificationActionListener();
  return {
    phase,
    phaseLabel,
    isRunning,
    remainingSeconds,
    formattedTime,
    completedWorkCount,
    sessionInCycle,
    canSkip,
    sessionProgress,
    focusSecondsToday,
    nextBreakKind,
    start,
    pause,
    toggle,
    skip,
    addFiveMinutes,
    reset,
  };
}
