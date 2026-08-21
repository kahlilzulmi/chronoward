import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";

const isAndroid = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

function formatError(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Drive sync failed.";
}

export async function runDriveSync(): Promise<void> {
  if (isAndroid) {
    const remote = await invoke<{ contents?: string }>(
      "plugin:chronoward-tracking|drive_appdata_download",
    );
    const merged = await invoke<string>("google_merge_usage_jsonl", {
      payload: { remoteJsonl: remote?.contents ?? "" },
    });
    await invoke("plugin:chronoward-tracking|drive_appdata_upload", {
      contents: merged ?? "",
    });
    return;
  }
  await invoke("google_sync_drive");
}

export function useDriveSync() {
  const syncing = ref(false);
  const syncError = ref("");

  async function syncNow() {
    syncing.value = true;
    syncError.value = "";
    try {
      await runDriveSync();
    } catch (error) {
      syncError.value = formatError(error);
      throw error;
    } finally {
      syncing.value = false;
    }
  }

  return { syncing, syncError, syncNow };
}
