import { configured } from "../db";
import { rpc } from "./api";
import * as local from "./demo";
import { decimal, parseMoney } from "./money";
import { today } from "./dates";
import { validateGoal } from "./goals";
import type { FinancialGoal, AccountTransfer } from "../types";
export function saveGoal(g: FinancialGoal) {
  validateGoal(g);
  return configured
    ? rpc("save_goal", {
        p_household: g.household_id,
        p_id: g.id,
        p_version: g.version,
        p_name: g.name.trim(),
        p_target: decimal(parseMoney(g.target_amount)),
        p_deadline: g.deadline,
        p_monthly: decimal(parseMoney(g.monthly_amount, true)),
        p_archived: g.archived,
      })
    : local.localGoal(g);
}
export const saveCards = (
  family: string,
  amount: string,
  date: string,
  version: number,
) =>
  configured
    ? rpc("save_card_settings", {
        p_household: family,
        p_amount: decimal(parseMoney(amount, true)),
        p_date: date,
        p_version: version,
      })
    : local.localCardSettings(amount, date, version);
export const captureBaseline = (
  g: FinancialGoal,
  required: number,
  balance: number,
) =>
  configured
    ? rpc("capture_goal_baseline", {
        p_household: g.household_id,
        p_id: g.id,
        p_version: g.version,
        p_required: decimal(required),
        p_balance: decimal(balance),
      })
    : local.localBaseline(g, {
        captured_on: today(),
        target_amount: g.target_amount,
        deadline: g.deadline,
        monthly_amount: g.monthly_amount,
        required_amount: decimal(required),
        balance_amount: decimal(balance),
      });
export const saveAccountTransfer = (t: AccountTransfer, remove = false) =>
  configured
    ? rpc("save_savings_transfer", {
        p_household: t.household_id,
        p_id: t.id,
        p_version: t.version,
        p_from: t.from_account,
        p_to: t.to_account,
        p_amount: decimal(parseMoney(t.amount)),
        p_date: t.occurred_on,
        p_comment: t.comment?.trim() || null,
        p_delete: remove,
      })
    : local.localAccountTransfer(t, remove);
