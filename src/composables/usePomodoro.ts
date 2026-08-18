import { computed, ref, watch } from "vue";
import { LONG_BREAK_INTERVAL, settings } from "./useSettings";

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
let sessionDurationSeconds = settings.workMinutes * 60;

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

function emitPreAlert() {
  console.log("[chronoward] pre-alert", {
    phase: phase.value,
    remainingSeconds: remainingSeconds.value,
  });
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

function startTicking() {
  clearTick();
  targetEndMs = Date.now() + remainingSeconds.value * 1000;
  isRunning.value = true;
  intervalId = setInterval(tick, TICK_MS);
}

function enterPhase(nextPhase: PomodoroPhase, autoRun: boolean) {
  clearTick();
  phase.value = nextPhase;
  sessionDurationSeconds = durationSecondsFor(nextPhase);
  remainingSeconds.value = sessionDurationSeconds;
  isRunning.value = false;
  armPreAlert();

  if (autoRun && nextPhase !== "idle") {
    startTicking();
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
    startTicking();
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

watch(
  () => settings.workMinutes,
  () => {
    if (phase.value === "idle" && !isRunning.value) {
      sessionDurationSeconds = durationSecondsFor("idle");
      remainingSeconds.value = sessionDurationSeconds;
    }
  },
);

const formattedTime = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60);
  const seconds = remainingSeconds.value % 60;
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
  };
}
