<script setup lang="ts">
import { computed } from "vue";
import type { PomodoroPhase } from "../composables/usePomodoro";

const props = defineProps<{
  remainingSeconds: number;
  totalSeconds: number;
  phase: PomodoroPhase;
  isRunning: boolean;
}>();

const radius = 118;
const stroke = 10;
const cx = 130;
const cy = 130;
const circumference = 2 * Math.PI * radius;

const progress = computed(() => {
  if (props.totalSeconds <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, props.remainingSeconds / props.totalSeconds));
});

const dashOffset = computed(() => circumference * (1 - progress.value));

const ringColor = computed(() => {
  if (props.phase === "work") {
    return "#2dd4bf";
  }
  if (props.phase === "idle") {
    return "#475569";
  }
  return "#38bdf8";
});

const minutes = computed(() => Math.floor(Math.max(0, props.remainingSeconds) / 60));
const seconds = computed(() => Math.max(0, props.remainingSeconds) % 60);
const timeStr = computed(
  () =>
    `${String(minutes.value).padStart(2, "0")}:${String(seconds.value).padStart(2, "0")}`,
);
</script>

<template>
  <div class="mx-auto flex w-full max-w-[260px] flex-col items-center gap-2" aria-live="polite">
    <p
      class="min-h-[14px] text-[10px] font-semibold uppercase tracking-[0.2em]"
      :class="isRunning ? 'text-teal-400' : 'invisible'"
    >
      Running
    </p>
    <svg class="h-auto w-full" viewBox="0 0 260 260" role="img" aria-label="Pomodoro timer">
      <circle
        :cx="cx"
        :cy="cy"
        :r="radius"
        fill="none"
        stroke="currentColor"
        class="text-slate-800"
        :stroke-width="stroke"
      />
      <circle
        :cx="cx"
        :cy="cy"
        :r="radius"
        fill="none"
        :stroke="ringColor"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        :transform="`rotate(-90 ${cx} ${cy})`"
        class="transition-[stroke-dashoffset] duration-300"
      />
      <text
        :x="cx"
        :y="cy - 6"
        text-anchor="middle"
        dominant-baseline="central"
        fill="currentColor"
        class="fill-slate-100 font-mono text-[2.75rem] font-semibold"
      >
        {{ timeStr }}
      </text>
    </svg>
  </div>
</template>
