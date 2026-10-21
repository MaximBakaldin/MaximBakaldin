import { client } from "../db";
import type { Draft, HistoryFilter, Snapshot, Transaction } from "../types";
import { monthBounds } from "./dates";
import { decimal, parseMoney } from "./money";
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const snapshot = (month: string) =>
  rpc<Snapshot | null>("budget_snapshot", { p_month: `${month}-01` });
export async function history(
  family: string,
  month: string,
  filter: HistoryFilter,
  offset: number,
  pageSize = 30,
) {
  const { start, end } = monthBounds(month);
  let query = client()
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("household_id", family)
    .gte("occurred_on", start)
    .lt("occurred_on", end)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (filter.category) query = query.eq("category_id", filter.category);
  if (filter.search.trim())
    query = query.ilike(
      "comment",
      `%${filter.search.trim().replace(/[\\%_]/g, "\\$&")}%`,
    );
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as Transaction[], count: count ?? 0 };
}
export const saveTransaction = (family: string, draft: Draft) =>
  rpc("save_transaction", {
    p_household: family,
    p_id: draft.id,
    p_version: draft.version,
    p_category: draft.category_id,
    p_kind: draft.kind,
    p_amount: decimal(parseMoney(draft.amount)),
    p_date: draft.occurred_on,
    p_comment: draft.comment.trim() || null,
  });
export const deleteTransaction = (row: Transaction) =>
  rpc("delete_transaction", { p_id: row.id, p_version: row.version });
export async function exportHistory(
  family: string,
  month: string,
  revision: number,
): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  let count: number | null = null;
  while (count === null || rows.length < count) {
    const page = await history(
      family,
      month,
      { category: "", search: "" },
      rows.length,
      500,
    );
    if (count !== null && count !== page.count)
      throw new Error(
        "Данные изменились во время экспорта. Повторите выгрузку",
      );
    count = page.count;
    if (!page.rows.length && rows.length < count)
      throw new Error("Сервер вернул неполную выгрузку");
    rows.push(...page.rows);
  }
  const latest = await snapshot(month);
  if (
    !latest ||
    latest.family.id !== family ||
    latest.revision !== revision ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    throw new Error("Данные изменились во время экспорта. Повторите выгрузку");
  return rows;
}
