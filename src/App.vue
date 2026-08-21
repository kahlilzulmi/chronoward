<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { RouterLink, RouterView, useRouter } from "vue-router";
import BlockerOverlay from "./components/BlockerOverlay.vue";
import { useIntervention } from "./composables/useIntervention";
import { useAndroidTrackingPermissions } from "./composables/useAndroidTrackingPermissions";
import { useTracking } from "./composables/useTracking";
import { runDriveSync } from "./composables/useDriveSync";

const { isBlocking } = useIntervention();
useTracking();
const router = useRouter();
const { isAndroid, isLoaded, needsUsageAccess, fetchStatus } =
  useAndroidTrackingPermissions();

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
    class="flex min-h-dvh flex-col bg-stone-100 text-stone-900"
  >
    <header
      class="sticky top-0 z-10 border-b border-stone-200/80 bg-stone-100/90 backdrop-blur-sm"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div
        class="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3 sm:max-w-2xl sm:px-6 md:max-w-5xl md:py-4 lg:max-w-6xl"
      >
        <p class="text-base font-semibold tracking-tight sm:text-lg">Chronoward</p>
        <nav class="hidden gap-1 md:flex" aria-label="Primary">
          <RouterLink
            v-slot="{ href, navigate, isExactActive }"
            to="/"
            custom
          >
            <a
              :href="href"
              class="rounded-full px-4 py-2 text-sm font-medium transition"
              :class="
                isExactActive
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:bg-white hover:text-stone-900'
              "
              @click="navigate"
            >
              Dashboard
            </a>
          </RouterLink>
          <RouterLink
            v-slot="{ href, navigate, isExactActive }"
            to="/settings"
            custom
          >
            <a
              :href="href"
              class="rounded-full px-4 py-2 text-sm font-medium transition"
              :class="
                isExactActive
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:bg-white hover:text-stone-900'
              "
              @click="navigate"
            >
              Settings
            </a>
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 sm:max-w-2xl sm:px-6 md:max-w-5xl lg:max-w-6xl">
      <RouterView />
    </main>

    <nav
      class="sticky bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur-sm md:hidden"
      style="padding-bottom: env(safe-area-inset-bottom)"
      aria-label="Primary"
    >
      <div class="mx-auto grid max-w-lg grid-cols-2 px-2 py-2">
        <RouterLink v-slot="{ href, navigate, isExactActive }" to="/" custom>
          <a
            :href="href"
            class="block rounded-xl px-3 py-3 text-center text-sm font-medium"
            :class="isExactActive ? 'bg-stone-100 text-teal-800' : 'text-stone-500'"
            @click="navigate"
          >
            Dashboard
          </a>
        </RouterLink>
        <RouterLink
          v-slot="{ href, navigate, isExactActive }"
          to="/settings"
          custom
        >
          <a
            :href="href"
            class="block rounded-xl px-3 py-3 text-center text-sm font-medium"
            :class="isExactActive ? 'bg-stone-100 text-teal-800' : 'text-stone-500'"
            @click="navigate"
          >
            Settings
          </a>
        </RouterLink>
      </div>
    </nav>
    <BlockerOverlay v-if="isBlocking" />
  </div>
</template>
