<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";
import { requestNotificationPermission } from "../composables/useNotify";
import { btnPrimaryClass, btnSecondaryClass } from "../ui/themeClasses";

const router = useRouter();
const { needsUsageAccess, isChecking, fetchStatus, requestPermissions } =
  useAndroidTrackingPermissions();

const isReady = computed(() => !needsUsageAccess.value);

async function refreshAndRouteIfReady() {
  await fetchStatus();
  if (isReady.value) {
    await router.replace({ name: "timer" });
  }
}

async function openSettings() {
  await requestPermissions(false);
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") {
    void refreshAndRouteIfReady();
  }
}

function onWindowFocus() {
  void refreshAndRouteIfReady();
}

onMounted(() => {
  void requestNotificationPermission();
  void refreshAndRouteIfReady();
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onWindowFocus);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("focus", onWindowFocus);
});
</script>

<template>
  <section class="mx-auto flex w-full max-w-xl flex-1 items-center py-8 sm:py-12">
    <article
      class="w-full rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10 sm:p-8"
    >
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300">
        Android setup
      </p>
      <h1 class="mt-3 text-2xl font-semibold tracking-tight text-amber-950 dark:text-amber-100 sm:text-3xl">
        Enable Usage Access to start ChronoWard
      </h1>
      <p class="mt-4 text-sm leading-6 text-amber-900 dark:text-amber-100/90 sm:text-base">
        ChronoWard needs Usage Access to detect the active app and run focus interventions.
        Without this permission, tracking cannot start.
      </p>
      <p class="mt-3 text-sm leading-6 text-amber-900 dark:text-amber-100/90 sm:text-base">
        Android will also ask for notification permission so work, break, and 1-minute
        pre-alerts can reach this phone and a paired smartband.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button type="button" :class="btnPrimaryClass" @click="openSettings">Open Settings</button>
        <button
          type="button"
          :class="btnSecondaryClass"
          :disabled="isChecking"
          @click="refreshAndRouteIfReady"
        >
          {{ isChecking ? "Checking..." : "I've enabled it, Recheck" }}
        </button>
      </div>
    </article>
  </section>
</template>
