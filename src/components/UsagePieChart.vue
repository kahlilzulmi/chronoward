<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Doughnut } from "vue-chartjs";
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import {
  getAggregatedUsage,
  type AggregatedUsageRow,
  type DateRangePreset,
  type DeviceTypeFilter,
} from "../services/analytics";

ChartJS.register(ArcElement, Tooltip, Legend);

const TOP_N = 8;

const SLICE_COLORS = [
  "#2dd4bf",
  "#34d399",
  "#14b8a6",
  "#10b981",
  "#5eead4",
  "#6ee7b7",
  "#22d3ee",
  "#38bdf8",
];
const OTHER_COLOR = "#64748b";

const dateRange = ref<DateRangePreset>("today");
const deviceType = ref<DeviceTypeFilter>("all");
const rows = ref<AggregatedUsageRow[]>([]);
const loading = ref(true);

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${total}s`;
}

function capSlices(items: AggregatedUsageRow[]): AggregatedUsageRow[] {
  if (items.length <= TOP_N) {
    return items;
  }
  const head = items.slice(0, TOP_N);
  const otherSeconds = items
    .slice(TOP_N)
    .reduce((sum, row) => sum + row.totalSeconds, 0);
  if (otherSeconds <= 0) {
    return head;
  }
  return [...head, { appName: "Other", totalSeconds: otherSeconds }];
}

const slices = computed(() => capSlices(rows.value));
const hasData = computed(() => slices.value.length > 0);

const chartData = computed<ChartData<"doughnut">>(() => ({
  labels: slices.value.map((slice) => slice.appName),
  datasets: [
    {
      data: slices.value.map((slice) => slice.totalSeconds),
      backgroundColor: slices.value.map((slice, index) =>
        slice.appName === "Other"
          ? OTHER_COLOR
          : SLICE_COLORS[index % SLICE_COLORS.length],
      ),
      borderColor: "#0f172a",
      borderWidth: 2,
      hoverOffset: 4,
    },
  ],
}));

const chartOptions: ChartOptions<"doughnut"> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "58%",
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        color: "#f8fafc",
        boxWidth: 10,
        padding: 12,
        font: { size: 11 },
      },
    },
    tooltip: {
      callbacks: {
        label(ctx) {
          const value = typeof ctx.parsed === "number" ? ctx.parsed : 0;
          return ` ${ctx.label}: ${formatDuration(value)}`;
        },
      },
    },
  },
};

const pillIdle =
  "rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700";
const pillActive =
  "rounded-full bg-teal-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950";

let fetchGen = 0;

async function refetch() {
  const gen = ++fetchGen;
  loading.value = true;
  const next = await getAggregatedUsage({
    dateRange: dateRange.value,
    deviceType: deviceType.value,
  });
  if (gen !== fetchGen) {
    return;
  }
  rows.value = next;
  loading.value = false;
}

watch([dateRange, deviceType], () => {
  void refetch();
}, { immediate: true });
</script>

<template>
  <article class="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100">
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      Analytics
    </p>

    <div class="mt-4 space-y-2">
      <div class="flex flex-wrap gap-1" role="group" aria-label="Date range">
        <button
          type="button"
          :class="dateRange === 'today' ? pillActive : pillIdle"
          :aria-pressed="dateRange === 'today'"
          @click="dateRange = 'today'"
        >
          Today
        </button>
        <button
          type="button"
          :class="dateRange === 'last7days' ? pillActive : pillIdle"
          :aria-pressed="dateRange === 'last7days'"
          @click="dateRange = 'last7days'"
        >
          Last 7 Days
        </button>
      </div>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Device">
        <button
          type="button"
          :class="deviceType === 'all' ? pillActive : pillIdle"
          :aria-pressed="deviceType === 'all'"
          @click="deviceType = 'all'"
        >
          All Devices
        </button>
        <button
          type="button"
          :class="deviceType === 'desktop' ? pillActive : pillIdle"
          :aria-pressed="deviceType === 'desktop'"
          @click="deviceType = 'desktop'"
        >
          Desktop
        </button>
        <button
          type="button"
          :class="deviceType === 'mobile' ? pillActive : pillIdle"
          :aria-pressed="deviceType === 'mobile'"
          @click="deviceType = 'mobile'"
        >
          Mobile
        </button>
      </div>
    </div>

    <div class="mt-4 min-h-52">
      <p v-if="loading" class="py-10 text-center text-sm text-slate-400">
        Loading usage…
      </p>
      <p
        v-else-if="!hasData"
        class="py-10 text-center text-sm text-slate-400"
      >
        No app usage yet for this period. All Devices merges after Drive sync.
      </p>
      <div v-else class="relative h-56 w-full">
        <Doughnut :data="chartData" :options="chartOptions" />
      </div>
    </div>
  </article>
</template>
