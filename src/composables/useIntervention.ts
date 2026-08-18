import { ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { settings } from "./useSettings";
import { usePomodoro } from "./usePomodoro";
import { notifyUser } from "./useNotify";

const WARNING_COOLDOWN_MS = 10_000;

const isBlocking = ref(false);
const distractionsBlocked = ref(0);
const matchedEntry = ref("");

let lastWarningAt = 0;

function isIgnoredApp(appName: string): boolean {
  const haystack = appName.toLowerCase();
  return settings.ignoredApps.some((item) => {
    const needle = item.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

function matchingBlocklistEntry(appName: string, url: string): string | null {
  const haystack = `${appName} ${url}`.toLowerCase();
  for (const entry of settings.blocklist) {
    const needle = entry.trim().toLowerCase();
    if (needle.length > 0 && haystack.includes(needle)) {
      return entry;
    }
  }
  return null;
}

async function fireWarning() {
  const sent = await notifyUser(
    "Chronoward",
    "Distraction detected. Get back to work!",
  );
  if (!sent) {
    console.log("[chronoward] distraction warning (notification unavailable)");
  }
}

async function fireBlock() {
  const { pause } = usePomodoro();
  pause();
  isBlocking.value = true;

  try {
    const appWindow = getCurrentWindow();
    await appWindow.show();
    await appWindow.setFocus();
    await appWindow.maximize();
    await appWindow.setAlwaysOnTop(true);
  } catch (error) {
    console.log("[chronoward] window takeover unavailable", error);
  }
}

export function evaluateContext(appName: string, url: string) {
  if (isIgnoredApp(appName)) {
    return;
  }

  const { phase } = usePomodoro();
  if (phase.value !== "work") {
    return;
  }

  const hit = matchingBlocklistEntry(appName, url);
  if (!hit) {
    return;
  }

  if (settings.interventionMode === "warning") {
    const now = Date.now();
    if (now - lastWarningAt < WARNING_COOLDOWN_MS) {
      return;
    }
    lastWarningAt = now;
    matchedEntry.value = hit;
    distractionsBlocked.value += 1;
    void fireWarning();
    return;
  }

  if (isBlocking.value) {
    return;
  }

  matchedEntry.value = hit;
  distractionsBlocked.value += 1;
  void fireBlock();
}

export async function returnToWork() {
  try {
    const appWindow = getCurrentWindow();
    await appWindow.setAlwaysOnTop(false);
    await appWindow.unmaximize();
  } catch (error) {
    console.log("[chronoward] window restore unavailable", error);
  }

  isBlocking.value = false;
  matchedEntry.value = "";
  usePomodoro().start();
}

export function useIntervention() {
  return {
    isBlocking,
    distractionsBlocked,
    matchedEntry,
    evaluateContext,
    returnToWork,
  };
}
