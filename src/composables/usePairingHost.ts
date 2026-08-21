import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { onMounted, ref } from "vue";

export type PairingHostInfo = {
  ip: string;
  port: number;
  pin: string;
  expiresInSeconds?: number;
};

const isPaired = ref(false);
let pairingEventsBound = false;

function formatInvokeError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not start pairing mode.";
}

function bindPairingEvents() {
  if (pairingEventsBound) {
    return;
  }
  pairingEventsBound = true;
  void listen("pairing-connected", () => {
    isPaired.value = true;
  });
  void listen("pairing-disconnected", () => {
    isPaired.value = false;
  });
}

export function usePairingHost(enabled: boolean) {
  const pairingHost = ref<PairingHostInfo | null>(null);
  const pairingError = ref("");
  const pairingBusy = ref(false);

  async function startPairingMode() {
    if (!enabled) {
      return;
    }
    pairingBusy.value = true;
    pairingError.value = "";
    isPaired.value = false;
    try {
      pairingHost.value = await invoke<PairingHostInfo>("start_pairing_mode");
    } catch (error) {
      pairingHost.value = null;
      pairingError.value = formatInvokeError(error);
    } finally {
      pairingBusy.value = false;
    }
  }

  async function stopPairingMode() {
    if (!enabled) {
      return;
    }
    pairingBusy.value = true;
    try {
      await invoke("stop_pairing_mode");
      pairingHost.value = null;
      isPaired.value = false;
    } catch (error) {
      pairingError.value = formatInvokeError(error);
    } finally {
      pairingBusy.value = false;
    }
  }

  onMounted(() => {
    if (enabled) {
      bindPairingEvents();
    }
  });

  return {
    pairingHost,
    pairingError,
    pairingBusy,
    isPaired,
    startPairingMode,
    stopPairingMode,
  };
}
