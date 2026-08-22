import { computed } from "vue";
import { useAndroidTrackingPermissions } from "./useAndroidTrackingPermissions";
import { usePairingHost } from "./usePairingHost";
import { usePairingClient } from "./usePairingClient";

export function usePairingStatus() {
  const { isAndroid } = useAndroidTrackingPermissions();
  const { isPaired } = usePairingHost(!isAndroid.value);
  const { isConnected } = usePairingClient();

  const isRemoteConnected = computed(() =>
    isAndroid.value ? isConnected.value : isPaired.value,
  );

  const remoteDeviceLabel = computed(() =>
    isAndroid.value ? "Desktop (paired)" : "Mobile (paired)",
  );

  const remoteDeviceType = computed(() => (isAndroid.value ? "Desktop" : "Phone"));

  return {
    isRemoteConnected,
    remoteDeviceLabel,
    remoteDeviceType,
  };
}

export function useThisDeviceLabel() {
  const { isAndroid } = useAndroidTrackingPermissions();

  return computed(() => {
    if (isAndroid.value) {
      return { name: "This phone", type: "Phone" as const };
    }
    if (/windows/i.test(navigator.userAgent)) {
      return { name: "This PC", type: "Laptop" as const };
    }
    if (/mac/i.test(navigator.userAgent)) {
      return { name: "This Mac", type: "Laptop" as const };
    }
    return { name: "This device", type: "Laptop" as const };
  });
}
