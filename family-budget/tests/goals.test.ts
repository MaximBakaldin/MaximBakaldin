// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { goalPlan } from "../src/lib/goals";
import {
  localGoal,
  localSavingsAccount,
  localSavings,
  localSnapshot,
  localAccountTransfer,
} from "../src/lib/demo";
import type { FinancialGoal, SavingsAccountData } from "../src/types";
const g: FinancialGoal = {
  id: "goal",
  household_id: "local-family",
  name: "Цель",
  target_amount: "300000",
  monthly_amount: "50000",
  deadline: "2026-12-31",
  version: 0,
  archived: false,
};
const account = (balance: number): SavingsAccountData => ({
  id: "a",
  name: "A",
  goal_id: g.id,
  version: 1,
  is_default: true,
  balance_cents: String(balance * 100),
  transfer_cents: "0",
  has_opening: true,
});
const plan = (
  balance: number,
  fact: number,
  month = "2026-10",
  paid = 0,
  paidMonth = 0,
) =>
  goalPlan(
    {
      ...g,
      contribution_cents: String(fact * 100),
      paid_cents: String(paid * 100),
      paid_month_cents: String(paidMonth * 100),
    },
    [account(balance)],
    month,
    "2026-10",
  );
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T07:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it("учитывает проценты, снятие и внутренний перевод в изменении остатка, без повторного начального остатка", () => {
  localGoal(g);
  localSavingsAccount(
    "local-savings",
    "Накопления",
    1,
    {
      annual_rate: 36.5,
      interest_start: "2026-10-01",
      interest_frequency: "daily",
    },
    g.id,
  );
  localSavingsAccount("second", "Другой вклад", 0, undefined, g.id);
  localSavings({
    id: "initial",
    version: 0,
    account_id: "local-savings",
    kind: "opening",
    amount: "100000",
    occurred_on: "2026-09-30",
    comment: "",
  });
  vi.setSystemTime(new Date("2026-10-02T07:00:00Z"));
  const deposit = {
    id: "deposit",
    version: 0,
    account_id: "local-savings",
    kind: "deposit" as const,
    amount: "20000",
    occurred_on: "2026-10-02",
    comment: "",
  };
  localSavings(deposit);
  expect(localSnapshot("2026-10").goals![0].contribution_cents).toBe("2010000");
  localSavings({
    ...deposit,
    id: "withdrawal",
    kind: "withdrawal",
    amount: "40000",
  });
  expect(localSnapshot("2026-10").goals![0].contribution_cents).toBe(
    "-1990000",
  );
  localAccountTransfer({
    id: "transfer",
    household_id: "local-family",
    version: 0,
    from_account: "local-savings",
    to_account: "second",
    amount: "10000",
    occurred_on: "2026-10-02",
    comment: "",
  });
  const snapshot = localSnapshot("2026-10");
  expect(snapshot.goals![0].contribution_cents).toBe("-1990000");
  expect(snapshot.savings?.balance_cents).toBe("8010000");
  localGoal({ ...g, id: "other", name: "Другая" });
  localSavingsAccount("second", "Другой вклад", 1, undefined, "other");
  expect(
    localSnapshot("2026-10").goals!.find((x) => x.id === "other")
      ?.contribution_cents,
  ).toBe("0");
});
it("пересчитывает необходимый взнос и срок после пропущенного или отрицательного закрытого месяца", () => {
  // September is closed: October-December remain.
  expect(plan(150000, 50000, "2026-09").required).toBe(5000000);
  expect(plan(100000, 0, "2026-09").required).toBe(6666667);
  expect(plan(80000, -20000, "2026-09").required).toBe(7333334);
  expect(plan(80000, -20000, "2026-09").forecast).toBe("2027-02");
});
it("отдельно показывает текущую доплату, а превышение взноса снижает будущие платежи", () => {
  expect(plan(120000, 20000)).toMatchObject({
    required: 6666667,
    thisMonthLeft: 4666667,
  });
  expect(plan(250000, 150000)).toMatchObject({
    required: 2500000,
    thisMonthLeft: 0,
  });
  expect(plan(80000, -20000)).toMatchObject({
    required: 6666667,
    thisMonthLeft: 8666667,
  });
});
it("покупка для цели сохраняет прогресс и не требует накопить потраченное второй раз", () => {
  const before = plan(100000, 0);
  const after = plan(80000, -20000, "2026-10", 20000, 20000);
  expect(after.required).toBe(before.required);
  expect(after.thisMonthLeft).toBe(before.thisMonthLeft);
  expect(after.forecast).toBe(before.forecast);
  expect(plan(0, -100000, "2026-10", 300000, 100000)).toMatchObject({
    remaining: 0,
    required: 0,
    thisMonthLeft: 0,
    percent: 100,
  });
});
it("нулевой план не обещает дату, большой срок не выходит за пределы календаря", () => {
  expect(
    goalPlan(
      { ...g, monthly_amount: "0" },
      [account(100000)],
      "2026-10",
      "2026-10",
    ).forecast,
  ).toBeNull();
  expect(
    goalPlan(
      { ...g, monthly_amount: "0.01", target_amount: "999999999999.99" },
      [account(0)],
      "2026-10",
      "2026-10",
    ).forecast,
  ).toBeNull();
});
