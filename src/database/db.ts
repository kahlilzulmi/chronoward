import { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import { appDataDir } from "@tauri-apps/api/path";
import { AppSchema } from "./AppSchema";

/**
 * PowerSync local DB. Filename is deliberately not `chronoward.db`
 * so it does not collide with `tauri-plugin-sql` (still the write path until 5.4).
 */
export const db = new PowerSyncTauriDatabase({
  schema: AppSchema,
  database: {
    dbFilename: "powersync.db",
    dbLocationAsync: appDataDir,
  },
});
