<script setup lang="ts">
import { ref } from "vue";
import {
  Format,
  checkPermissions,
  requestPermissions,
  scan,
} from "@tauri-apps/plugin-barcode-scanner";
import {
  DEFAULT_PAIRING_PORT,
  parsePairingQr,
  usePairingClient,
} from "../composables/usePairingClient";
import {
  bodyClass,
  btnPrimaryClass,
  hintClass,
  inputClass,
  insetPanelClass,
  labelClass,
} from "../ui/themeClasses";

const { isConnected, isConnecting, statusMessage, connectWithPin } =
  usePairingClient();

const isAndroid = /android/i.test(navigator.userAgent);
const ip = ref("");
const port = ref(DEFAULT_PAIRING_PORT);
const pin = ref("");
const isScanning = ref(false);

function formatScanError(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Camera scanner is not available. Enter IP and PIN below.";
}

function isScanCancelled(error: unknown): boolean {
  const message = formatScanError(error).toLowerCase();
  return message.includes("cancel") || message.includes("cancelled");
}

async function scanQrContent(): Promise<string> {
  const current = await checkPermissions();
  if (current !== "granted") {
    const granted = await requestPermissions();
    if (granted !== "granted") {
      throw new Error("Camera permission is required to scan the pairing QR.");
    }
  }
  const result = await scan({
    windowed: false,
    formats: [Format.QRCode],
  });
  if (typeof result?.content === "string" && result.content.trim()) {
    return result.content;
  }
  throw new Error("Scan returned no QR content.");
}

async function connect() {
  await connectWithPin(ip.value, Number(port.value), pin.value);
}

async function scanQrAndConnect() {
  isScanning.value = true;
  try {
    const content = await scanQrContent();
    const parsed = parsePairingQr(content);
    if (!parsed) {
      statusMessage.value = "QR was not valid pairing JSON. Enter IP and PIN below.";
      return;
    }
    ip.value = parsed.ip;
    pin.value = parsed.pin;
    port.value = parsed.port;
    await connectWithPin(parsed.ip, parsed.port, parsed.pin);
  } catch (error) {
    if (isScanCancelled(error)) {
      statusMessage.value = "Scan cancelled. Enter IP and PIN below.";
      return;
    }
    statusMessage.value = formatScanError(error);
  } finally {
    isScanning.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <p :class="bodyClass">
      Scan the desktop QR, or enter the IP, port, and 6-digit PIN. Same Wi-Fi —
      pairing does not use
      <span class="font-mono text-xs">adb reverse</span>.
    </p>

    <div v-if="isConnected" class="px-4 py-4 text-center" :class="insetPanelClass">
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-400">
        Connected
      </p>
      <p class="mt-2 font-mono text-xs text-teal-800/80 dark:text-teal-400/80">
        {{ ip.trim() }}:{{ port }}
      </p>
    </div>

    <button
      v-if="isAndroid"
      type="button"
      class="min-h-11 w-full rounded-xl border px-4 text-sm font-semibold"
      :class="
        isScanning || isConnecting
          ? 'border-stone-200 bg-stone-100 text-stone-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
          : btnPrimaryClass
      "
      :disabled="isScanning || isConnecting"
      @click="scanQrAndConnect"
    >
      {{ isScanning ? "Scanning…" : "Scan QR Code" }}
    </button>

    <label class="block space-y-1.5">
      <span :class="labelClass">Desktop IP</span>
      <input
        v-model="ip"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        placeholder="192.168.x.x"
        :class="inputClass"
      />
      <span :class="hintClass">
        Filled from the QR, or copy the IP from the desktop pairing screen.
      </span>
    </label>

    <label class="block space-y-1.5">
      <span :class="labelClass">Port</span>
      <input
        v-model.number="port"
        type="number"
        inputmode="numeric"
        min="1"
        max="65535"
        :class="inputClass"
      />
      <span :class="hintClass">
        Default {{ DEFAULT_PAIRING_PORT }}. Vite HMR stays on 1421; pairing uses this port.
      </span>
    </label>

    <label class="block space-y-1.5">
      <span :class="labelClass">PIN</span>
      <input
        v-model="pin"
        type="text"
        inputmode="numeric"
        maxlength="6"
        autocomplete="one-time-code"
        placeholder="000000"
        :class="[inputClass, 'font-mono text-2xl tracking-[0.35em]']"
      />
    </label>

    <button
      type="button"
      class="min-h-11 w-full rounded-xl border px-4 text-sm font-semibold"
      :class="
        isConnecting
          ? 'border-stone-200 bg-stone-100 text-stone-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
          : btnPrimaryClass
      "
      :disabled="isConnecting || isScanning"
      @click="connect"
    >
      {{ isConnecting ? "Connecting…" : isConnected ? "Reconnect" : "Connect" }}
    </button>
    <p v-if="statusMessage && !isConnected" :class="hintClass">{{ statusMessage }}</p>
  </div>
</template>
