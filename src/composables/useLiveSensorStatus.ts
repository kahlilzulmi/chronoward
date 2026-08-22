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
          tone: "bg-rose-500/15 text-rose-400",
          dot: "bg-rose-500",
        };
      }
      if (needsAccessibility.value) {
        return {
          label: "APP-ONLY",
          tone: "bg-amber-500/15 text-amber-400",
          dot: "bg-amber-500",
        };
      }
      if (!isLive.value) {
        return {
          label: "OFFLINE / PERMISSION MISSING",
          tone: "bg-rose-500/15 text-rose-400",
          dot: "bg-rose-500",
        };
      }
      return {
        label: "ACTIVE",
        tone: "bg-emerald-500/15 text-emerald-400",
        dot: "animate-pulse bg-emerald-400",
      };
    }

    if (isLive.value) {
      return {
        label: "ACTIVE",
        tone: "bg-emerald-500/15 text-emerald-400",
        dot: "animate-pulse bg-emerald-400",
      };
    }

    return {
      label: "WAITING",
      tone: "bg-amber-500/15 text-amber-400",
      dot: "bg-amber-500",
    };
  });

  return { sensorStatus, isLive };
}
