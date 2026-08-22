<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import AppSidebar from "./components/AppSidebar.vue";
import MobileNav from "./components/MobileNav.vue";
import BlockerOverlay from "./components/BlockerOverlay.vue";
import { useIntervention } from "./composables/useIntervention";
import { useAndroidTrackingPermissions } from "./composables/useAndroidTrackingPermissions";
import { useTracking } from "./composables/useTracking";
import { runDriveSync } from "./composables/useDriveSync";
import "./composables/useTheme";

const { isBlocking } = useIntervention();
useTracking();
const router = useRouter();
const route = useRoute();
const { isAndroid, isLoaded, needsUsageAccess, fetchStatus } =
  useAndroidTrackingPermissions();

const hideChrome = computed(() => route.name === "onboarding");

let driveTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void fetchStatus();
  if (isAndroid.value) {
    driveTimer = setInterval(() => {
      void runDriveSync().catch(() => {});
    }, 15 * 60 * 1000);
  }
});

onUnmounted(() => {
  if (driveTimer) {
    clearInterval(driveTimer);
  }
});

watch([isLoaded, needsUsageAccess], () => {
  if (!isAndroid.value || !isLoaded.value) {
    return;
  }
  const routeName = router.currentRoute.value.name;
  if (needsUsageAccess.value && routeName !== "onboarding") {
    void router.replace({ name: "onboarding" });
    return;
  }
  if (!needsUsageAccess.value && routeName === "onboarding") {
    void router.replace({ name: "timer" });
  }
});
</script>

<template>
  <div
    v-if="hideChrome"
    class="min-h-dvh bg-stone-100 text-stone-900 dark:bg-slate-950 dark:text-slate-100"
  >
    <RouterView />
    <BlockerOverlay v-if="isBlocking" />
  </div>

  <div
    v-else
    class="flex h-dvh overflow-hidden bg-stone-100 text-stone-900 dark:bg-slate-950 dark:text-slate-100"
  >
    <AppSidebar class="hidden lg:flex" />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <main
        class="mx-auto w-full flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6 lg:max-w-6xl lg:px-8 lg:pb-8"
        style="padding-top: max(1rem, env(safe-area-inset-top))"
      >
        <RouterView />
      </main>
    </div>

    <MobileNav class="lg:hidden" />
    <BlockerOverlay v-if="isBlocking" />
  </div>
</template>
