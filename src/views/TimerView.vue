<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { usePomodoro, type PomodoroPhase } from "../composables/usePomodoro";
import { useSensorFeed } from "../composables/useSensorFeed";
import { useIntervention } from "../composables/useIntervention";
import { LONG_BREAK_INTERVAL, settings } from "../composables/useSettings";

const {
  phase,
  phaseLabel,
  isRunning,
  formattedTime,
  sessionInCycle,
  canSkip,
  sessionProgress,
  focusSecondsToday,
  nextBreakKind,
  toggle,
  skip,
} = usePomodoro();

const { activeApplication, activeContext, windowTitle, isLive } = useSensorFeed();
const { isBlocking, distractionsBlocked } = useIntervention();

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

const focusTimeLabel = computed(() => {
  const total = Math.max(0, Math.floor(focusSecondsToday.value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

const upcomingBreakLabel = computed(() => {
  if (phase.value === "shortBreak" || phase.value === "longBreak") {
    return `Now · ${formattedTime.value}`;
  }
  if (phase.value === "work") {
    return `${formattedTime.value} · ${nextBreakKind.value}`;
  }
  return `After work · ${nextBreakKind.value}`;
});

const modeBadge = computed(() => {
  if (phase.value === "shortBreak") {
    return `BREAK (${settings.shortBreakMinutes}m)`;
  }
  if (phase.value === "longBreak") {
    return `BREAK (${settings.longBreakMinutes}m)`;
  }
  return `FOCUS (${settings.workMinutes}m)`;
});

const timerCardClass = computed(() => {
  if (isRunning.value && phase.value === "work") {
    return "border-teal-700/50 md:shadow-md";
  }
  if (isRunning.value) {
    return "border-sky-700/40";
  }
  return "border-stone-200";
});

const progressPercent = computed(() => Math.round(sessionProgress.value * 100));

const sessionSlots = Array.from({ length: LONG_BREAK_INTERVAL }, (_, i) => i + 1);

function onKeydown(event: KeyboardEvent) {
  if (isBlocking.value) {
    return;
  }
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    toggle();
    return;
  }
  if ((event.key === "s" || event.key === "S") && canSkip.value) {
    event.preventDefault();
    skip();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <section class="grid flex-1 grid-cols-1 gap-4 py-4 md:grid-cols-3 md:items-stretch md:gap-5 md:py-8">
    <article
      class="flex flex-col justify-between gap-6 rounded-2xl border bg-white p-6 md:col-span-2 md:gap-8 md:p-8"
      :class="timerCardClass"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Timer
            </p>
            <span
              class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600"
            >
              {{ modeBadge }}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <p class="font-mono text-sm tabular-nums text-stone-500">
              Session {{ sessionInCycle }}/{{ LONG_BREAK_INTERVAL }}
            </p>
            <div class="hidden items-center gap-1.5 md:flex" aria-hidden="true">
              <span
                v-for="slot in sessionSlots"
                :key="slot"
                class="h-2 w-2 rounded-full"
                :class="
                  slot <= sessionInCycle
                    ? 'bg-teal-800'
                    : 'bg-stone-200'
                "
              />
            </div>
          </div>
        </div>
        <p
          class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]"
          :class="phaseBadgeClass"
        >
          {{ phaseLabel }}
        </p>
      </div>

      <div class="space-y-4 text-center">
        <p
          class="font-mono text-5xl font-semibold tabular-nums tracking-tight text-stone-900 sm:text-6xl md:text-7xl lg:text-8xl"
          aria-live="polite"
        >
          {{ formattedTime }}
        </p>
        <div class="h-1.5 overflow-hidden rounded-full bg-stone-100 md:h-2">
          <div
            class="h-full rounded-full transition-[width] duration-200"
            :class="phase === 'work' ? 'bg-teal-800' : phase === 'idle' ? 'bg-stone-300' : 'bg-sky-700'"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 md:gap-4">
        <button
          type="button"
          class="min-h-11 flex-1 rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 md:min-h-12 md:flex-none md:px-10 md:text-base"
          @click="toggle"
        >
          {{ primaryActionLabel }}
        </button>
        <button
          type="button"
          class="min-h-11 min-w-24 rounded-full border border-stone-300 bg-stone-50 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-not-allowed disabled:opacity-40 md:min-h-12 md:px-8 md:text-base"
          :disabled="!canSkip"
          @click="skip"
        >
          Skip
        </button>
        <p class="hidden text-xs text-stone-400 md:ml-2 md:block">
          <kbd class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono">Space</kbd>
          start/pause
          <span class="mx-1">·</span>
          <kbd class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono">S</kbd>
          skip
        </p>
      </div>
    </article>

    <div class="flex flex-col gap-4 md:gap-5">
      <article class="rounded-2xl border border-stone-200 bg-stone-50 p-6 md:p-6">
        <div class="mb-4 flex items-center justify-between gap-3">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Live Sensor
          </p>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
            :class="
              isLive
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            "
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="isLive ? 'animate-pulse bg-emerald-600' : 'bg-amber-600'"
            />
            {{ isLive ? "Active" : "Mock" }}
          </span>
        </div>
        <dl class="space-y-4">
          <div class="space-y-1">
            <dt class="text-xs font-medium text-stone-500">Active Application</dt>
            <dd class="truncate font-mono text-sm text-stone-900">
              {{ activeApplication }}
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs font-medium text-stone-500">Active Context / URL</dt>
            <dd class="truncate font-mono text-sm text-stone-900" :title="activeContext">
              {{ activeContext }}
            </dd>
          </div>
          <div v-if="isLive && windowTitle" class="space-y-1">
            <dt class="text-xs font-medium text-stone-500">Window Title</dt>
            <dd class="truncate font-mono text-xs text-stone-600" :title="windowTitle">
              {{ windowTitle }}
            </dd>
          </div>
        </dl>
      </article>

      <article class="rounded-2xl border border-stone-200 bg-white p-6">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Analytics
        </p>
        <dl class="mt-4 divide-y divide-stone-100">
          <div class="py-3 first:pt-0">
            <dt class="text-xs font-medium text-stone-500">Total Focus Time Today</dt>
            <dd class="mt-1 font-mono text-xl font-semibold tabular-nums text-stone-900">
              {{ focusTimeLabel }}
            </dd>
          </div>
          <div class="py-3">
            <dt class="text-xs font-medium text-stone-500">Distractions Blocked</dt>
            <dd class="mt-1 font-mono text-xl font-semibold tabular-nums text-stone-900">
              {{ distractionsBlocked }}
            </dd>
          </div>
          <div class="py-3 last:pb-0">
            <dt class="text-xs font-medium text-stone-500">Upcoming Break</dt>
            <dd class="mt-1 font-mono text-sm font-semibold tabular-nums text-stone-900">
              {{ upcomingBreakLabel }}
            </dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>
