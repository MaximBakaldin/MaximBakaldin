import { configured } from "../db";
import { rpc } from "./api";
import * as local from "./demo";
import { decimal, parseMoney } from "./money";
import type {
  Category,
  Recurring,
  RecurringDraft,
  SavingsDraft,
} from "../types";
export const renameFamily = (family: string, name: string, version: number) =>
  configured
    ? rpc("rename_family", {
        p_household: family,
        p_name: name,
        p_version: version,
      })
    : local.localRename(name, version);
export const saveCategory = (c: Category) =>
  configured
    ? rpc("save_category", {
        p_household: c.household_id,
        p_id: c.id,
        p_name: c.name.trim(),
        p_kind: c.kind,
        p_archived: !!c.archived,
        p_version: c.version ?? 0,
      })
    : local.localCategory(c);
export const saveRecurring = (
  family: string,
  month: string,
  r: RecurringDraft,
) =>
  configured
    ? rpc("save_recurring", {
        p_household: family,
        p_month: month + "-01",
        p_id: r.id,
        p_version: r.version,
        p_name: r.name.trim(),
        p_category: r.category_id,
        p_amount: decimal(parseMoney(r.amount)),
        p_day: r.due_day,
        p_active: r.active,
      })
    : local.localRecurring(r, month);
export const payRecurring = (
  family: string,
  month: string,
  r: Recurring,
  date: string,
) =>
  configured
    ? rpc("pay_recurring", {
        p_household: family,
        p_id: r.id,
        p_month: month + "-01",
        p_version: r.version,
        p_date: date,
      })
    : local.localPay(r, month, date);
export const saveSavings = (family: string, d: SavingsDraft, remove = false) =>
  configured
    ? rpc("save_savings", {
        p_household: family,
        p_id: d.id,
        p_version: d.version,
        p_kind: d.kind,
        p_amount: decimal(parseMoney(d.amount)),
        p_date: d.occurred_on,
        p_comment: d.comment.trim() || null,
        p_delete: remove,
        p_account: d.account_id ?? null,
      })
    : local.localSavings(d, remove);
export function dueDate(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function signedCents(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Некорректная сумма от сервера");
  return n;
}

export const saveSavingsAccount = (
  family: string,
  id: string,
  name: string,
  version: number,
) =>
  configured
    ? rpc("save_savings_account", {
        p_household: family,
        p_id: id,
        p_name: name,
        p_version: version,
      })
    : local.localSavingsAccount(id, name, version);
