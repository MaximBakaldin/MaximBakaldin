import type { Snapshot } from "../types";
import { summaryCents, total } from "./money";
export type MonthPoint = {
  month: string;
  spent: number;
  earned: number;
  summary: Snapshot["summary"];
};
export function monthPoint(month: string, snapshot: Snapshot): MonthPoint {
  return {
    month,
    summary: snapshot.summary,
    spent: total(
      snapshot.summary
        .filter((s) => s.kind === "expense")
        .map((s) => summaryCents(s.cents)),
    ),
    earned: total(
      snapshot.summary
        .filter((s) => s.kind === "income")
        .map((s) => summaryCents(s.cents)),
    ),
  };
}
export function changeFrom(previous: number, current: number) {
  return {
    difference: current - previous,
    percent:
      previous === 0
        ? null
        : Math.round(((current - previous) / previous) * 100),
  };
}

export type DateRange = { from: string; to: string };
export type AnalysisRow = {
  period: string;
  category_id: string;
  kind: "expense" | "income";
  cents: string;
};
export type TrendPoint = {
  key: string;
  label: string;
  range: DateRange;
  spent: number;
  earned: number;
  summary: Snapshot["summary"];
};
export function shiftDay(date: string, by: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
export function monthRange(month: string): DateRange {
  const d = new Date(month + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from: month + "-01", to: d.toISOString().slice(0, 10) };
}
export function weekRange(date: string): DateRange {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  const from = shiftDay(date, -((day + 6) % 7));
  return { from, to: shiftDay(from, 6) };
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
export function buildTrend(
  rows: AnalysisRow[],
  range: DateRange | null,
  daily: boolean,
): TrendPoint[] {
  const keys = rows.map((r) => r.period).sort();
  const start = range?.from ?? keys[0],
    end =
      range?.to ??
      (keys.length
        ? monthRange(keys[keys.length - 1].slice(0, 7)).to
        : undefined);
  if (!start || !end) return [];
  const result: TrendPoint[] = [];
  for (let date = daily ? start : start.slice(0, 7) + "-01"; date <= end;) {
    const bounds = daily
      ? { from: date, to: date }
      : monthRange(date.slice(0, 7));
    const summary = rows
      .filter((r) => r.period === date)
      .map(({ category_id, kind, cents }) => ({ category_id, kind, cents }));
    result.push({
      key: date,
      label: daily
        ? dateLabel(date)
        : new Intl.DateTimeFormat("ru-RU", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(date + "T12:00:00Z")),
      range: {
        from: bounds.from < start ? start : bounds.from,
        to: bounds.to > end ? end : bounds.to,
      },
      summary,
      spent: total(
        summary
          .filter((s) => s.kind === "expense")
          .map((s) => summaryCents(s.cents)),
      ),
      earned: total(
        summary
          .filter((s) => s.kind === "income")
          .map((s) => summaryCents(s.cents)),
      ),
    });
    date = shiftDay(bounds.to, 1);
  }
  return result;
}
export function combineSummary(rows: AnalysisRow[]): Snapshot["summary"] {
  const sums = new Map<
    string,
    { category_id: string; kind: "expense" | "income"; amount: number }
  >();
  for (const r of rows) {
    const key = r.kind + ":" + r.category_id;
    const old = sums.get(key);
    sums.set(key, {
      category_id: r.category_id,
      kind: r.kind,
      amount: total([old?.amount ?? 0, summaryCents(r.cents)]),
    });
  }
  return [...sums.values()].map(({ category_id, kind, amount }) => ({
    category_id,
    kind,
    cents: String(amount),
  }));
}
