import { readonly, ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { evaluateContext } from "./useIntervention";

export interface WindowContext {
  app_name: string;
  window_title: string;
  url: string;
}

const activeApplication = ref("Visual Studio Code");
const activeContext = ref("src/main.ts");
const windowTitle = ref("");
const isLive = ref(false);

let started = false;

function applyContext(context: WindowContext) {
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
    applyContext(event.payload);
  })
    .then(() => {
      isLive.value = true;
    })
    .catch(() => {
      started = false;
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
