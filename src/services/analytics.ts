import { invoke } from "@tauri-apps/api/core";

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

export async function getAggregatedUsage(
  filters: UsageFilters,
): Promise<AggregatedUsageRow[]> {
  try {
    const { start, end } = resolveRange(filters.dateRange);
    const rows = await invoke<Array<{ appName?: string; totalSeconds?: number }>>(
      "get_aggregated_usage",
      {
        query: {
          start,
          end,
          deviceType: filters.deviceType === "all" ? null : filters.deviceType,
        },
      },
    );

    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const appName = String(row.appName ?? "").trim();
        const totalSeconds = Number(row.totalSeconds ?? 0);
        if (!appName || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
          return null;
        }
        return { appName, totalSeconds };
      })
      .filter((row): row is AggregatedUsageRow => row !== null);
  } catch (error) {
    console.error("[chronoward] getAggregatedUsage failed", error);
    return [];
  }
}
