import { column, Schema, Table } from "@powersync/common";

/**
 * Local PowerSync mirror of Supabase `app_usage`.
 * PowerSync auto-creates `id` (text); do not declare it here.
 * `user_id` must match the Supabase uuid column (stored as text locally).
 */
const app_usage = new Table({
  user_id: column.text,
  device_type: column.text,
  app_name: column.text,
  url: column.text,
  duration: column.integer,
  timestamp: column.text,
});

export const AppSchema = new Schema({
  app_usage,
});

export type Database = (typeof AppSchema)["types"];
export type AppUsageRecord = Database["app_usage"];
