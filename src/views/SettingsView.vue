<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import QrcodeVue from "qrcode.vue";
import { usePomodoro } from "../composables/usePomodoro";
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";
import { useLiveSensorStatus } from "../composables/useLiveSensorStatus";
import { testNotification, requestNotificationPermission, getLastNotificationError } from "../composables/useNotify";
import { pairingQrJson } from "../composables/usePairingClient";
import { usePairingHost } from "../composables/usePairingHost";
import { useGoogleAuth } from "../composables/useGoogleAuth";
import { useDriveSync } from "../composables/useDriveSync";
import PairingClient from "../components/PairingClient.vue";
import {
  clampMinutes,
  DEFAULT_SETTINGS,
  parseListInput,
  settings,
} from "../composables/useSettings";

const { phase, isRunning } = usePomodoro();
const {
  isAndroid,
  isLoaded,
  needsUsageAccess,
  fetchStatus,
  requestPermissions,
} = useAndroidTrackingPermissions();
const { sensorStatus: deviceTrackingStatus } = useLiveSensorStatus();
const { pairingHost, pairingError, pairingBusy, isPaired, startPairingMode, stopPairingMode } =
  usePairingHost(!isAndroid.value);
const { status: googleStatus, busy: googleBusy, errorMessage: googleError, cancelled: googleCancelled, refresh: refreshGoogle, signIn, cancelSignIn, signOut } =
  useGoogleAuth();
const { syncing: driveSyncing, syncError: driveSyncError, syncNow } = useDriveSync();

const pairingQrValue = computed(() => {
  if (!pairingHost.value) {
    return "";
  }
  return pairingQrJson(pairingHost.value.ip, pairingHost.value.pin, pairingHost.value.port);
});

const thisDevice = computed(() => {
  if (isAndroid.value) {
    return { name: "This device", platform: "Android" };
  }
  if (/windows/i.test(navigator.userAgent)) {
    return { name: "This PC", platform: "Windows" };
  }
  return { name: "This device", platform: "Desktop" };
});

const notificationTestHint = ref("");

async function onSyncNow() {
  try {
    await syncNow();
    await refreshGoogle();
  } catch {
    await refreshGoogle();
  }
}

function formatSyncAt(value: string) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 1_000_000_000) {
    return new Date(n * 1000).toLocaleString();
  }
  return value;
}

async function sendTestNotification() {
  notificationTestHint.value = "Requesting notification permission…";
  const granted = await requestNotificationPermission();
  if (!granted) {
    notificationTestHint.value =
      getLastNotificationError() ||
      "Notifications blocked. Allow Chronoward in system notification settings, then try again.";
    return;
  }
  notificationTestHint.value = "Sending…";
  const sent = await testNotification();
  notificationTestHint.value = sent
    ? "Sent. Check the system tray / notification shade."
    : `Not sent. ${getLastNotificationError() || "Allow notifications when the system asks, then try again."}`;
}

function commitMinutes(
  field: "workMinutes" | "shortBreakMinutes" | "longBreakMinutes",
) {
  settings[field] = clampMinutes(settings[field], DEFAULT_SETTINGS[field]);
}

const liveSessionHint = computed(() =>
  phase.value !== "idle" || isRunning.value
    ? "Duration changes apply to the next session."
    : "Idle countdown follows the work duration.",
);

const blocklistText = ref(settings.blocklist.join("\n"));
const ignoredAppsText = ref(settings.ignoredApps.join("\n"));

function commitBlocklist() {
  settings.blocklist = parseListInput(
    blocklistText.value,
    DEFAULT_SETTINGS.blocklist,
  );
  blocklistText.value = settings.blocklist.join("\n");
}

function commitIgnoredApps() {
  settings.ignoredApps = parseListInput(
    ignoredAppsText.value,
    DEFAULT_SETTINGS.ignoredApps,
  );
  ignoredAppsText.value = settings.ignoredApps.join("\n");
}

onMounted(() => {
  void fetchStatus();
});

</script>

<template>
  <section class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-6 sm:gap-8 sm:py-10">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
        Settings
      </h1>
      <p class="text-sm text-stone-500 sm:text-base">{{ liveSessionHint }}</p>
    </header>

    <section class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <h2 class="text-sm font-medium text-stone-800 sm:text-base">Devices</h2>
        <p class="mt-1 text-sm text-stone-500">
          This install plus a desktop LAN host PIN for a mobile app on the same Wi-Fi.
        </p>
      </div>

      <div class="flex items-start justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-stone-900">{{ thisDevice.name }}</p>
          <p class="mt-0.5 font-mono text-xs text-stone-500">{{ thisDevice.platform }}</p>
        </div>
        <span
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
          :class="deviceTrackingStatus.tone"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="deviceTrackingStatus.dot" />
          {{ deviceTrackingStatus.label }}
        </span>
      </div>

      <div class="space-y-2 border-t border-stone-100 pt-4">
        <p class="text-sm font-medium text-stone-800">Notifications</p>
        <p class="text-sm text-stone-500">
          Work start, break start, and the 1-minute pre-alert use system notifications on desktop and Android.
          On Android 13+, allow the notification prompt before sending a test.
        </p>
        <button
          type="button"
          class="min-h-11 rounded-xl border border-stone-300 bg-stone-50 px-4 text-sm font-semibold text-stone-700"
          @click="sendTestNotification"
        >
          Send test notification
        </button>
        <p v-if="notificationTestHint" class="text-xs text-stone-500">{{ notificationTestHint }}</p>
        <div class="flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div>
            <p class="text-sm font-medium text-stone-800 sm:text-base">
              Show ongoing timer notification with quick actions
            </p>
            <p class="text-sm text-stone-500">
              Persistent shade / toast with Pause, Skip, +5 min, and Stop while a session is active.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            class="relative h-7 w-12 shrink-0 rounded-full transition"
            :class="settings.showOngoingTimerNotification ? 'bg-teal-800' : 'bg-stone-300'"
            :aria-checked="settings.showOngoingTimerNotification"
            @click="
              settings.showOngoingTimerNotification = !settings.showOngoingTimerNotification
            "
          >
            <span
              class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition"
              :class="
                settings.showOngoingTimerNotification ? 'translate-x-5' : 'translate-x-0'
              "
            />
          </button>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div>
            <p class="text-sm font-medium text-stone-800 sm:text-base">
              Save browser URLs in the local log
            </p>
            <p class="text-sm text-stone-500">
              Off by default. App names still log. URLs will not go to Drive when sync ships.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            class="relative h-7 w-12 shrink-0 rounded-full transition"
            :class="settings.persistUrls ? 'bg-teal-800' : 'bg-stone-300'"
            :aria-checked="settings.persistUrls"
            @click="settings.persistUrls = !settings.persistUrls"
          >
            <span
              class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition"
              :class="settings.persistUrls ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </div>

      <div class="border-t border-stone-100 pt-4">
        <RouterLink
          to="/help"
          class="text-sm font-medium text-teal-800 hover:underline"
        >
          Help &amp; Troubleshooting →
        </RouterLink>
      </div>

      <div class="space-y-3 border-t border-stone-100 pt-4">
        <div>
          <p class="text-sm font-medium text-stone-800">Google account</p>
          <p class="mt-1 text-sm text-stone-500">
            Same Google account on this PC and your phone is how All Devices merges via Drive
            app data. URLs are not uploaded. Sign in again on this PC to grant Drive if Sync now
            asks for consent.
          </p>
        </div>
        <p v-if="googleStatus?.signedIn" class="text-sm text-teal-800">
          Signed in{{ googleStatus.email ? ` as ${googleStatus.email}` : "" }}.
        </p>
        <p v-else class="text-sm text-stone-500">Not signed in.</p>
        <p class="text-xs text-stone-500">{{ googleStatus?.nextStep }}</p>
        <p v-if="googleError" class="text-sm text-amber-800">{{ googleError }}</p>
        <p v-else-if="googleCancelled" class="text-sm text-stone-500">Sign-in cancelled.</p>
        <p v-else-if="googleBusy" class="text-sm text-stone-500">Waiting for Google…</p>
        <p v-if="googleStatus?.lastSyncAt" class="text-xs text-stone-500">
          Last sync: {{ formatSyncAt(googleStatus.lastSyncAt) }}
        </p>
        <p v-if="driveSyncError" class="text-sm text-amber-800">{{ driveSyncError }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="min-h-11 rounded-xl border border-stone-300 bg-stone-50 px-4 text-sm font-semibold text-stone-700"
            :disabled="googleBusy"
            @click="signIn"
          >
            Sign in with Google
          </button>
          <button
            v-if="googleBusy"
            type="button"
            class="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"
            @click="cancelSignIn"
          >
            Cancel
          </button>
          <button
            type="button"
            class="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"
            :disabled="googleBusy || driveSyncing || !googleStatus?.signedIn"
            @click="signOut"
          >
            Sign out
          </button>
          <button
            type="button"
            class="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"
            :disabled="googleBusy || driveSyncing || !googleStatus?.signedIn"
            @click="onSyncNow"
          >
            {{ driveSyncing ? "Syncing…" : "Sync now" }}
          </button>
        </div>
      </div>

      <div class="space-y-3 border-t border-stone-100 pt-4">
        <div>
          <p class="text-sm font-medium text-stone-800">Pair another device</p>
          <p class="mt-1 text-sm text-stone-500">
            Same-Wi-Fi fallback. Drive is the bind once both devices are signed in. The pairing
            port is closed until you start pairing. PIN lasts 10 minutes and locks after 8 failures.
          </p>
        </div>

        <template v-if="!isAndroid">
          <div
            v-if="pairingHost"
            class="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4 text-center"
          >
            <div class="flex justify-center">
              <QrcodeVue
                :value="pairingQrValue"
                :size="192"
                level="M"
                render-as="svg"
                background="#fafaf9"
                foreground="#1c1917"
              />
            </div>
            <p class="mt-3 font-mono text-3xl font-semibold tracking-[0.35em] text-stone-900">
              {{ pairingHost.pin }}
            </p>
            <p class="mt-2 text-sm text-stone-500">
              Scan the QR from the Android app. PIN is the fallback if the camera is unavailable.
            </p>
            <p class="mt-2 font-mono text-xs text-stone-500">
              {{ pairingHost.ip }}:{{ pairingHost.port }}
            </p>
            <p v-if="pairingHost.expiresInSeconds" class="mt-1 text-xs text-stone-400">
              PIN expires in {{ pairingHost.expiresInSeconds }}s
            </p>
            <p
              v-if="isPaired"
              class="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-teal-800"
            >
              Connected
            </p>
          </div>
          <p v-else-if="pairingError" class="text-sm text-amber-800">{{ pairingError }}</p>
          <p v-else class="text-sm text-stone-500">Pairing is off. Start it only when the phone is nearby.</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="min-h-11 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-4 text-sm font-semibold text-stone-700"
              :disabled="pairingBusy"
              @click="startPairingMode"
            >
              {{ pairingHost ? "New PIN" : "Start pairing" }}
            </button>
            <button
              v-if="pairingHost"
              type="button"
              class="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"
              :disabled="pairingBusy"
              @click="stopPairingMode"
            >
              Stop pairing
            </button>
          </div>
        </template>
        <PairingClient v-else />
      </div>
    </section>

    <div
      v-if="isAndroid && isLoaded && needsUsageAccess"
      class="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-6"
    >
      <p class="text-sm font-semibold text-amber-900">
        Usage Access is required to track the foreground app
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 rounded-xl border border-amber-700 bg-amber-700 px-4 text-sm font-semibold text-white"
          @click="requestPermissions(false)"
        >
          Grant Usage Access
        </button>
      </div>
    </div>

    <div class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Work duration (minutes)</span>
        <input
          v-model.number="settings.workMinutes"
          type="number"
          inputmode="numeric"
          min="1"
          max="180"
          class="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitMinutes('workMinutes')"
        />
      </label>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Short break (minutes)</span>
        <input
          v-model.number="settings.shortBreakMinutes"
          type="number"
          inputmode="numeric"
          min="1"
          max="180"
          class="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitMinutes('shortBreakMinutes')"
        />
      </label>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Long break (minutes)</span>
        <input
          v-model.number="settings.longBreakMinutes"
          type="number"
          inputmode="numeric"
          min="1"
          max="180"
          class="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitMinutes('longBreakMinutes')"
        />
      </label>
    </div>

    <div class="space-y-1 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div class="flex items-center justify-between gap-4 py-2">
        <div>
          <p class="text-sm font-medium text-stone-800 sm:text-base">Auto-start work</p>
          <p class="text-sm text-stone-500">Start the next work session when a break ends.</p>
        </div>
        <button
          type="button"
          role="switch"
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="settings.autoStartWork ? 'bg-teal-800' : 'bg-stone-300'"
          :aria-checked="settings.autoStartWork"
          @click="settings.autoStartWork = !settings.autoStartWork"
        >
          <span
            class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition"
            :class="settings.autoStartWork ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-stone-100 py-2 pt-4">
        <div>
          <p class="text-sm font-medium text-stone-800 sm:text-base">Auto-start breaks</p>
          <p class="text-sm text-stone-500">Start the next break when a work session ends.</p>
        </div>
        <button
          type="button"
          role="switch"
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="settings.autoStartBreaks ? 'bg-teal-800' : 'bg-stone-300'"
          :aria-checked="settings.autoStartBreaks"
          @click="settings.autoStartBreaks = !settings.autoStartBreaks"
        >
          <span
            class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition"
            :class="settings.autoStartBreaks ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <div class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <p class="text-sm font-medium text-stone-800 sm:text-base">Intervention mode</p>
        <p class="text-sm text-stone-500">
          Warning sends a system notification. Block pauses work and takes over the screen.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="min-h-11 rounded-xl border px-4 text-sm font-semibold"
          :class="
            settings.interventionMode === 'warning'
              ? 'border-teal-800 bg-teal-800 text-white'
              : 'border-stone-300 bg-stone-50 text-stone-700'
          "
          @click="settings.interventionMode = 'warning'"
        >
          Warning
        </button>
        <button
          type="button"
          class="min-h-11 rounded-xl border px-4 text-sm font-semibold"
          :class="
            settings.interventionMode === 'block'
              ? 'border-teal-800 bg-teal-800 text-white'
              : 'border-stone-300 bg-stone-50 text-stone-700'
          "
          @click="settings.interventionMode = 'block'"
        >
          Block
        </button>
      </div>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Blocklist</span>
        <textarea
          v-model="blocklistText"
          rows="4"
          class="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitBlocklist"
        />
        <span class="text-xs text-stone-500">One domain or app fragment per line.</span>
      </label>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Ignored apps</span>
        <textarea
          v-model="ignoredAppsText"
          rows="3"
          class="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitIgnoredApps"
        />
        <span class="text-xs text-stone-500">
          If the active app name contains any of these, skip intervention (IDEs).
        </span>
      </label>
    </div>
  </section>
</template>
