<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { getAggregatedUsage, type AggregatedUsageRow } from "../services/analytics";
import { dashboardCardClass, linkClass } from "../ui/themeClasses";

const rows = ref<AggregatedUsageRow[]>([]);
const loading = ref(true);

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr${hours === 1 ? "" : "s"}, ${minutes} min`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return `${total}s`;
}

async function refetch() {
  loading.value = true;
  rows.value = await getAggregatedUsage({ dateRange: "today", deviceType: "all" });
  loading.value = false;
}

onMounted(() => {
  void refetch();
});

const totalSeconds = computed(() =>
  rows.value.reduce((sum, row) => sum + row.totalSeconds, 0),
);

const topApps = computed(() => rows.value.slice(0, 4));

const sliceColors = ["#2dd4bf", "#38bdf8", "#fbbf24", "#a78bfa"];

const hasData = computed(() => rows.value.length > 0);
</script>

<template>
  <article :class="dashboardCardClass">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" stroke-linecap="round" />
        </svg>
        <h2 class="text-sm font-semibold text-stone-900 dark:text-slate-100">Screen Time</h2>
      </div>
      <span class="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-slate-800 dark:text-slate-400">
        Today
      </span>
    </div>

    <p v-if="loading" class="py-6 text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
    <p v-else-if="!hasData" class="py-6 text-center text-sm text-stone-500 dark:text-slate-500">
      No usage recorded yet today.
    </p>
    <template v-else>
      <p class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">
        {{ formatDuration(totalSeconds) }}
      </p>
      <ul class="mt-4 space-y-2">
        <li
          v-for="(row, index) in topApps"
          :key="row.appName"
          class="flex items-center justify-between gap-3 text-sm"
        >
          <span class="flex min-w-0 items-center gap-2 text-stone-700 dark:text-slate-300">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: sliceColors[index] ?? '#64748b' }"
            />
            <span class="truncate">{{ row.appName }}</span>
          </span>
          <span class="shrink-0 text-stone-500 dark:text-slate-500">{{ formatDuration(row.totalSeconds) }}</span>
        </li>
      </ul>
    </template>

    <RouterLink to="/insights" :class="[linkClass, 'mt-4 inline-flex']">
      View full insights →
    </RouterLink>
  </article>
</template>
