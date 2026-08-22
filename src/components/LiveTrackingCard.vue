<script setup lang="ts">
import { computed } from "vue";
import { useSensorFeed } from "../composables/useSensorFeed";
import { usePomodoro } from "../composables/usePomodoro";
import { useLiveSensorStatus } from "../composables/useLiveSensorStatus";
import { usePairingStatus, useThisDeviceLabel } from "../composables/usePairingStatus";

const { activeApplication, activeContext } = useSensorFeed();
const { phase, isRunning } = usePomodoro();
const { isLive } = useLiveSensorStatus();
const { isRemoteConnected, remoteDeviceLabel, remoteDeviceType } = usePairingStatus();
const thisDevice = useThisDeviceLabel();

const nowLabel = computed(() => {
  const d = new Date();
  const date = d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${date} | ${time}`;
});

const localFocused = computed(
  () => isRunning.value && phase.value === "work" && isLive.value,
);

function appInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}
</script>

<template>
  <article class="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <h2 class="text-sm font-semibold text-slate-100">Live Tracking</h2>
      </div>
    </div>

    <ul class="space-y-4">
      <li class="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <div class="mb-3 flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-slate-100">{{ thisDevice.name }}</p>
            <p class="text-xs text-slate-500">{{ thisDevice.type }}</p>
          </div>
          <span
            class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            :class="
              localFocused
                ? 'bg-emerald-500/15 text-emerald-400'
                : isLive
                  ? 'bg-teal-500/15 text-teal-400'
                  : 'bg-slate-800 text-slate-400'
            "
          >
            {{ localFocused ? "Focused" : isLive ? "Active" : "Waiting" }}
          </span>
        </div>
        <div class="flex items-start gap-3">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-sm font-semibold text-teal-400"
          >
            {{ appInitial(activeApplication) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-200">{{ activeApplication }}</p>
            <p class="truncate text-xs text-slate-500" :title="activeContext">{{ activeContext }}</p>
            <p class="mt-1 text-[11px] text-slate-600">{{ nowLabel }}</p>
          </div>
        </div>
      </li>

      <li
        v-if="isRemoteConnected"
        class="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
      >
        <div class="mb-3 flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-slate-100">{{ remoteDeviceLabel }}</p>
            <p class="text-xs text-slate-500">{{ remoteDeviceType }}</p>
          </div>
          <span class="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-teal-400">
            Connected
          </span>
        </div>
        <p class="text-sm text-slate-500">
          Live context stays on each device. Usage merges after sync.
        </p>
      </li>
    </ul>
  </article>
</template>
