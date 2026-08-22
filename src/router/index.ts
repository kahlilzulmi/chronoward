import { createRouter, createWebHistory } from "vue-router";
import TimerView from "../views/TimerView.vue";
import SettingsView from "../views/SettingsView.vue";
import HelpView from "../views/HelpView.vue";
import OnboardingGate from "../views/OnboardingGate.vue";
import ProfileView from "../views/ProfileView.vue";
import SessionsView from "../views/SessionsView.vue";
import TasksView from "../views/TasksView.vue";
import InsightsView from "../views/InsightsView.vue";
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "timer", component: TimerView },
    { path: "/sessions", name: "sessions", component: SessionsView },
    { path: "/tasks", name: "tasks", component: TasksView },
    { path: "/insights", name: "insights", component: InsightsView },
    { path: "/profile", name: "profile", component: ProfileView },
    { path: "/settings", name: "settings", component: SettingsView },
    { path: "/help", name: "help", component: HelpView },
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
