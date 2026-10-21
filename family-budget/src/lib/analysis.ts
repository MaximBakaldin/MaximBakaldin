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
