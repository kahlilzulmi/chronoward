<script setup lang="ts">
import { computed } from "vue";
import { usePomodoro, type PomodoroPhase } from "../composables/usePomodoro";
import { LONG_BREAK_INTERVAL } from "../composables/useSettings";

const {
  phase,
  phaseLabel,
  isRunning,
  formattedTime,
  completedWorkCount,
  sessionInCycle,
  canSkip,
  toggle,
  skip,
} = usePomodoro();

const phaseBadgeClass = computed(() => {
  const classes: Record<PomodoroPhase, string> = {
    idle: "bg-stone-200 text-stone-700",
    work: "bg-teal-800 text-teal-50",
    shortBreak: "bg-sky-800 text-sky-50",
    longBreak: "bg-amber-800 text-amber-50",
  };
  return classes[phase.value];
});

const primaryActionLabel = computed(() => {
  if (isRunning.value) {
    return "Pause";
  }
  if (phase.value === "idle") {
    return "Start";
  }
  return "Resume";
});
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-8 py-6 sm:gap-10 sm:py-10">
    <div class="flex flex-col items-center gap-3">
      <p
        class="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] sm:text-sm"
        :class="phaseBadgeClass"
      >
        {{ phaseLabel }}
      </p>
      <p class="text-sm text-stone-500 sm:text-base">
        Session {{ sessionInCycle }} of {{ LONG_BREAK_INTERVAL }}
        <span class="text-stone-400">·</span>
        {{ completedWorkCount }} completed
      </p>
    </div>

    <p
      class="font-mono text-7xl font-semibold tabular-nums tracking-tight text-stone-900 sm:text-8xl md:text-9xl"
      aria-live="polite"
    >
      {{ formattedTime }}
    </p>

    <div class="flex w-full max-w-sm items-center justify-center gap-3 sm:gap-4">
      <button
        type="button"
        class="min-h-12 flex-1 rounded-full bg-teal-800 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 active:bg-teal-900 sm:min-h-14 sm:text-lg"
        @click="toggle"
      >
        {{ primaryActionLabel }}
      </button>
      <button
        type="button"
        class="min-h-12 min-w-24 rounded-full border border-stone-300 bg-white px-5 py-3 text-base font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-14 sm:min-w-28 sm:text-lg"
        :disabled="!canSkip"
        @click="skip"
      >
        Skip
      </button>
    </div>
  </section>
</template>
