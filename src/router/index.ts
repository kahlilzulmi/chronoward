import { createRouter, createWebHistory } from "vue-router";
import TimerView from "../views/TimerView.vue";
import SettingsView from "../views/SettingsView.vue";
import OnboardingGate from "../views/OnboardingGate.vue";
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "timer", component: TimerView },
    { path: "/settings", name: "settings", component: SettingsView },
    { path: "/onboarding", name: "onboarding", component: OnboardingGate },
  ],
});

router.beforeEach((to) => {
  const { isAndroid, needsUsageAccess, isLoaded } = useAndroidTrackingPermissions();

  if (!isAndroid.value || !isLoaded.value) {
    return true;
  }

  if (needsUsageAccess.value && to.name !== "onboarding") {
    return { name: "onboarding" };
  }

  if (!needsUsageAccess.value && to.name === "onboarding") {
    return { name: "timer" };
  }

  return true;
});

export default router;
