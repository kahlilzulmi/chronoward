import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

interface TrackingPermissionStatus {
  usageAccess: boolean;
  accessibilityEnabled: boolean;
  canTrackApps: boolean;
  canTrackUrls: boolean;
}

const EMPTY_STATUS: TrackingPermissionStatus = {
  usageAccess: false,
  accessibilityEnabled: false,
  canTrackApps: false,
  canTrackUrls: false,
};

const status = ref<TrackingPermissionStatus>({ ...EMPTY_STATUS });
const isAndroid = ref(/android/i.test(navigator.userAgent));
const pluginAvailable = ref(false);
const isLoaded = ref(false);
const isChecking = ref(false);
let inFlightStatusRequest: Promise<void> | null = null;

function parsePermissionStatus(value: unknown): TrackingPermissionStatus | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const usageAccess = Boolean(record.usageAccess ?? record.usage_access);
  const accessibilityEnabled = Boolean(
    record.accessibilityEnabled ?? record.accessibility_enabled,
  );
  return {
    usageAccess,
    accessibilityEnabled,
    canTrackApps: Boolean(record.canTrackApps ?? record.can_track_apps ?? usageAccess),
    canTrackUrls: Boolean(
      record.canTrackUrls ?? record.can_track_urls ?? (usageAccess && accessibilityEnabled),
    ),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("permission check timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchStatus() {
  if (inFlightStatusRequest) {
    await inFlightStatusRequest;
    return;
  }
  const pending = (async () => {
    isChecking.value = true;
    try {
      const result = await withTimeout(
        invoke<unknown>("plugin:chronoward-tracking|check_permissions"),
        4000,
      );
      const parsed = parsePermissionStatus(result);
      status.value = parsed ?? EMPTY_STATUS;
      pluginAvailable.value = true;
    } catch {
      pluginAvailable.value = false;
    } finally {
      isLoaded.value = true;
      isChecking.value = false;
    }
  })();
  inFlightStatusRequest = pending;
  try {
    await pending;
  } finally {
    if (inFlightStatusRequest === pending) {
      inFlightStatusRequest = null;
    }
  }
}

async function requestPermissions(requestAccessibility: boolean) {
  try {
    await invoke("plugin:chronoward-tracking|request_permissions", {
      requestAccessibility,
    });
  } catch {
    // no-op on non-android builds
  }
}

const needsUsageAccess = computed(
  () =>
    isAndroid.value &&
    isLoaded.value &&
    pluginAvailable.value &&
    !status.value?.usageAccess,
);

const needsAccessibility = computed(
  () =>
    isAndroid.value &&
    isLoaded.value &&
    pluginAvailable.value &&
    !status.value?.accessibilityEnabled,
);

const canTrackApps = computed(
  () => Boolean(status.value?.canTrackApps) && pluginAvailable.value,
);
const canTrackUrls = computed(
  () => Boolean(status.value?.canTrackUrls) && pluginAvailable.value,
);

export function useAndroidTrackingPermissions() {
  return {
    status,
    isAndroid,
    pluginAvailable,
    isLoaded,
    isChecking,
    needsUsageAccess,
    needsAccessibility,
    canTrackApps,
    canTrackUrls,
    fetchStatus,
    requestPermissions,
  };
}
