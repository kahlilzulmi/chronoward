<script setup lang="ts">
import { computed } from "vue";
import {
  formatDuration,
  formatSessionKind,
  formatTimeOfDay,
  records,
} from "../composables/useSessionHistory";

const sessions = computed(() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return records.value.filter((row) => row.completedAt >= startMs);
});

const totalFocusSeconds = computed(() =>
  sessions.value
    .filter((row) => row.kind === "work")
    .reduce((sum, row) => sum + row.durationSeconds, 0),
);
</script>

<template>
  <section class="mx-auto w-full max-w-2xl space-y-6 py-6 lg:py-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-100">Sessions</h1>
      <p class="text-sm text-slate-400">
        {{ sessions.length }} completed today ·
        {{ formatDuration(totalFocusSeconds) }} focus time
      </p>
    </header>

    <article
      v-if="sessions.length === 0"
      class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center"
    >
      <p class="text-sm text-slate-400">No completed sessions yet today.</p>
      <p class="mt-1 text-xs text-slate-500">Finish or skip a pomodoro phase to log it here.</p>
    </article>

    <ul v-else class="space-y-2">
      <li
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-100">
            {{ formatSessionKind(session.kind) }}
          </p>
          <p v-if="session.taskTitle" class="truncate text-xs text-slate-500">
            {{ session.taskTitle }}
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p class="font-mono text-sm text-teal-400">{{ formatDuration(session.durationSeconds) }}</p>
          <p class="text-xs text-slate-500">{{ formatTimeOfDay(session.completedAt) }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>
