import type { FinancialGoal, SavingsAccountData } from "../types";
import { currentMonth, shiftMonth, validDate } from "./dates";
import { parseMoney, total, signedCents } from "./money";

export function goalPlan(
  g: FinancialGoal,
  accounts: SavingsAccountData[],
  month: string,
  nowMonth = currentMonth(),
) {
  const balance = total(
    accounts
      .filter((a) => a.goal_id === g.id)
      .map((a) => signedCents(a.balance_cents)),
  );
  const paid = signedCents(g.paid_cents ?? "0");
  const fact = signedCents(g.contribution_cents ?? "0");
  const progressDelta = total([fact, signedCents(g.paid_month_cents ?? "0")]);
  const target = parseMoney(g.target_amount);
  const monthly = parseMoney(g.monthly_amount, true);
  const remaining = Math.max(0, target - balance - paid);
  const open = month >= nowMonth;
  const first = open ? month : shiftMonth(month, 1);
  const [y, m] = first.split("-").map(Number);
  const [dy, dm] = g.deadline.slice(0, 7).split("-").map(Number);
  const periods = Math.max(1, (dy - y) * 12 + dm - m + 1);
  // A purchase for the goal converts savings into completed progress.
  // For the open month solve R = max(0, payment - progressDelta) + (N-1)*payment.
  const required =
    remaining === 0
      ? 0
      : Math.ceil(
          open && periods > 1 && progressDelta >= remaining / (periods - 1)
            ? remaining / (periods - 1)
            : Math.max(0, remaining + (open ? progressDelta : 0)) / periods,
        );
  const thisMonthLeft =
    remaining === 0
      ? 0
      : open
        ? Math.min(remaining, Math.max(0, required - progressDelta))
        : required;
  const plannedLeft =
    monthly === 0 ? 0 : open ? Math.max(0, monthly - progressDelta) : monthly;
  let forecast: string | null = null;
  if (remaining === 0) forecast = month;
  else if (remaining <= plannedLeft) forecast = first;
  else if (monthly > 0) {
    const steps = Math.ceil((remaining - plannedLeft) / monthly);
    if (y * 12 + m - 1 + steps <= 9998 * 12 + 11)
      forecast = shiftMonth(first, steps);
  }
  return {
    balance,
    paid,
    fact,
    target,
    monthly,
    remaining,
    required,
    thisMonthLeft,
    forecast,
    late: remaining > 0 && (!forecast || forecast > g.deadline.slice(0, 7)),
    percent: Math.min(100, Math.max(0, ((balance + paid) / target) * 100)),
    open,
  };
}
export function validateGoal(g: FinancialGoal) {
  if (!g.name.trim() || g.name.trim().length > 60)
    throw new Error("Название цели: от 1 до 60 символов");
  parseMoney(g.target_amount);
  parseMoney(g.monthly_amount, true);
  if (!validDate(g.deadline)) throw new Error("Укажите срок цели");
}
