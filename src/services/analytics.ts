import Database from "@tauri-apps/plugin-sql";

export type DateRangePreset = "today" | "last7days";
export type CustomDateRange = { start: string; end: string };
export type DateRangeFilter = DateRangePreset | CustomDateRange;
export type DeviceTypeFilter = "all" | "desktop" | "mobile";

export interface UsageFilters {
  dateRange: DateRangeFilter;
  deviceType: DeviceTypeFilter;
}

export interface AggregatedUsageRow {
  appName: string;
  totalSeconds: number;
}

interface SqlAggRow {
  app_name?: string;
  appName?: string;
  total_seconds?: number | string;
  totalSeconds?: number | string;
}

const DB_URL = "sqlite:chronoward.db";

function isCustomRange(range: DateRangeFilter): range is CustomDateRange {
  return typeof range === "object" && range !== null && "start" in range;
}

function startOfLocalDay(base = new Date()): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveRange(dateRange: DateRangeFilter): { start: string; end: string } {
  if (isCustomRange(dateRange)) {
    return { start: dateRange.start, end: dateRange.end };
  }

  const todayStart = startOfLocalDay();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  if (dateRange === "today") {
    return { start: todayStart.toISOString(), end: tomorrowStart.toISOString() };
  }

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  return { start: weekStart.toISOString(), end: tomorrowStart.toISOString() };
}

function mapRow(row: SqlAggRow): AggregatedUsageRow | null {
  const appName = String(row.appName ?? row.app_name ?? "").trim();
  const totalSeconds = Number(row.totalSeconds ?? row.total_seconds ?? 0);
  if (!appName || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }
  return { appName, totalSeconds };
}

export async function getAggregatedUsage(
  filters: UsageFilters,
): Promise<AggregatedUsageRow[]> {
  try {
    const { start, end } = resolveRange(filters.dateRange);
    const bind: unknown[] = [start, end];
    let deviceClause = "";
    if (filters.deviceType !== "all") {
      deviceClause = " AND device_type = $3";
      bind.push(filters.deviceType);
    }

    const db = await Database.load(DB_URL);
    const rows = await db.select<SqlAggRow[]>(
      `SELECT app_name, SUM(duration_seconds) AS total_seconds
       FROM app_usage
       WHERE timestamp >= $1 AND timestamp < $2${deviceClause}
       GROUP BY app_name
       ORDER BY total_seconds DESC`,
      bind,
    );

    return (Array.isArray(rows) ? rows : [])
      .map(mapRow)
      .filter((row): row is AggregatedUsageRow => row !== null);
  } catch (error) {
    console.error("[chronoward] getAggregatedUsage failed", error);
    return [];
  }
}
