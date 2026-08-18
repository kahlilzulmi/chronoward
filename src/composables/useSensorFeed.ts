import { readonly, ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { addPluginListener } from "@tauri-apps/api/core";
import { evaluateContext } from "./useIntervention";
import { recordContextChange } from "./useTracking";

export interface WindowContext {
  app_name: string;
  window_title: string;
  url: string;
  device_type?: string;
}

const activeApplication = ref("Visual Studio Code");
const activeContext = ref("src/main.ts");
const windowTitle = ref("");
const isLive = ref(false);

let started = false;

function applyContext(context: WindowContext) {
  recordContextChange(context);
  activeApplication.value = context.app_name || "Unknown";
  const url = context.url.trim();
  activeContext.value = url || context.window_title || "—";
  windowTitle.value = context.window_title;
  evaluateContext(
    context.app_name,
    [context.url, context.window_title].filter(Boolean).join(" "),
  );
}

function startListening() {
  if (started) {
    return;
  }
  started = true;

  void listen<WindowContext>("window-context-changed", (event) => {
    applyContext({
      ...event.payload,
      device_type: event.payload.device_type ?? "desktop",
    });
    isLive.value = true;
  })
    .then(() => {
      // listener ready
    })
    .catch(() => {
      started = false;
    });

  void addPluginListener<WindowContext>(
    "chronoward-tracking",
    "window-context-changed",
    (payload) => {
      applyContext({
        ...payload,
        device_type: payload.device_type ?? "mobile",
      });
      isLive.value = true;
    },
  ).catch(() => {
    // plugin listener is expected to fail on desktop builds
  });
}

export function useSensorFeed() {
  startListening();
  return {
    activeApplication: readonly(activeApplication),
    activeContext: readonly(activeContext),
    windowTitle: readonly(windowTitle),
    isLive: readonly(isLive),
  };
}
