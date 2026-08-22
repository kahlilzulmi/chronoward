<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import PomodoroTimerCard from "../components/PomodoroTimerCard.vue";
import LiveTrackingCard from "../components/LiveTrackingCard.vue";
import ScreenTimeSummary from "../components/ScreenTimeSummary.vue";
import { usePomodoro } from "../composables/usePomodoro";
import { useIntervention } from "../composables/useIntervention";
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";

const { isBlocking } = useIntervention();
const { toggle, skip, canSkip } = usePomodoro();
const {
  isAndroid,
  needsUsageAccess,
  needsAccessibility,
  fetchStatus,
  requestPermissions,
} = useAndroidTrackingPermissions();

const accessibilityBannerDismissed = ref(false);

const showAccessibilityPrompt = computed(
  () =>
    isAndroid.value &&
    !needsUsageAccess.value &&
    needsAccessibility.value &&
    !accessibilityBannerDismissed.value,
);

function onVisibilityChange() {
  if (document.visibilityState === "visible") {
    void fetchStatus();
  }
}

async function openAccessibilitySettings() {
  await requestPermissions(true);
}

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
  document.addEventListener("visibilitychange", onVisibilityChange);
  void fetchStatus();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("visibilitychange", onVisibilityChange);
});
</script>

<template>
  <section class="flex flex-1 flex-col gap-3 py-1 sm:gap-4 sm:py-2 lg:gap-5 lg:py-4">
    <div
      v-if="showAccessibilityPrompt"
      class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="max-w-2xl space-y-1">
          <p class="text-sm font-semibold text-amber-200">Enable Deep URL Tracking (Optional)</p>
          <p class="text-sm text-amber-100/80">
            App tracking is active. Turn on Accessibility to read browser address bars for higher
            precision interventions.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
          @click="accessibilityBannerDismissed = true"
        >
          Dismiss
        </button>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white"
          @click="openAccessibilitySettings"
        >
          Open Accessibility Settings
        </button>
      </div>
    </div>

    <div class="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
      <div class="lg:col-span-2">
        <PomodoroTimerCard />
      </div>

      <div class="flex flex-col gap-4 lg:gap-5">
        <LiveTrackingCard />
        <ScreenTimeSummary />
      </div>
    </div>
  </section>
</template>
