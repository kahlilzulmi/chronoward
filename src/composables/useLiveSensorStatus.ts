import { computed } from "vue";
import { useSensorFeed } from "./useSensorFeed";
import { useAndroidTrackingPermissions } from "./useAndroidTrackingPermissions";

export function useLiveSensorStatus() {
  const { isLive } = useSensorFeed();
  const { isAndroid, pluginAvailable, needsUsageAccess, needsAccessibility } =
    useAndroidTrackingPermissions();

  const sensorStatus = computed(() => {
    if (isAndroid.value) {
      if (!pluginAvailable.value || needsUsageAccess.value) {
        return {
          label: "OFFLINE / PERMISSION MISSING",
          tone: "bg-rose-100 text-rose-800",
          dot: "bg-rose-600",
        };
      }
      if (needsAccessibility.value) {
        return {
          label: "APP-ONLY",
          tone: "bg-amber-100 text-amber-800",
          dot: "bg-amber-600",
        };
      }
      if (!isLive.value) {
        return {
          label: "OFFLINE / PERMISSION MISSING",
          tone: "bg-rose-100 text-rose-800",
          dot: "bg-rose-600",
        };
      }
      return {
        label: "ACTIVE",
        tone: "bg-emerald-100 text-emerald-800",
        dot: "animate-pulse bg-emerald-600",
      };
    }

    if (isLive.value) {
      return {
        label: "ACTIVE",
        tone: "bg-emerald-100 text-emerald-800",
        dot: "animate-pulse bg-emerald-600",
      };
    }

    return {
      label: "WAITING",
      tone: "bg-amber-100 text-amber-800",
      dot: "bg-amber-600",
    };
  });

  return { sensorStatus, isLive };
}
