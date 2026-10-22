// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import {
  localGoal,
  localSavingsAccount,
  localSavings,
  localSnapshot,
  localAccountTransfer,
  localCardSettings,
} from "../src/lib/demo";
import { today, currentMonth, shiftMonth } from "../src/lib/dates";
import type { FinancialGoal, AccountTransfer } from "../src/types";
const goal = (id = "goal-a"): FinancialGoal => ({
  id,
  household_id: "local-family",
  name: "Отпуск",
  target_amount: "300000",
  monthly_amount: "10000",
  deadline: shiftMonth(currentMonth(), 12) + "-28",
  version: 0,
  archived: false,
});
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function opening(account = "local-savings", amount = "100000") {
  localSavings({
    id: crypto.randomUUID(),
    account_id: account,
    kind: "opening",
    amount,
    occurred_on: today(),
    comment: "",
    version: 0,
  });
}
function accounts() {
  return localSnapshot(currentMonth()).savings!.accounts!;
}
it("создаёт общую цель, связывает счёт и открывает компактные детали на главной", async () => {
  const u = userEvent.setup();
  opening();
  render(<App />);
  await u.click(
    await screen.findByRole("button", { name: "Бюджет", exact: true }),
  );
  await u.click(
    screen.getByRole("button", { name: "Накопления", exact: true }),
  );
  await u.click(screen.getByRole("button", { name: "Новая цель" }));
  await u.type(screen.getByLabelText("Название цели"), "Отпуск");
  await u.type(screen.getByLabelText("Целевая сумма, ₽"), "300000");
  await u.type(screen.getByLabelText("Планируем откладывать, ₽/мес."), "10000");
  await u.click(screen.getByRole("button", { name: "Сохранить цель" }));
  await screen.findByText("Цель сохранена");
  const g = localSnapshot(currentMonth()).goals![0];
  await u.click(
    screen.getByRole("button", { name: "Настроить счёт Накопления" }),
  );
  await u.selectOptions(screen.getByLabelText("Связанная цель"), g.id);
  await u.click(screen.getByRole("button", { name: "Сохранить счёт" }));
  await screen.findByText("Счёт сохранён");
  expect(accounts()[0].goal_id).toBe(g.id);
  await u.click(screen.getByRole("button", { name: "Главная", exact: true }));
  const row = screen.getByRole("button", { name: "Цель Отпуск" });
  expect(row.textContent).toContain("Плановый срок");
  expect(row.textContent).toContain("Прогноз");
  expect(row.textContent).toContain("Нужно в месяц");
  await u.click(row);
  const details = within(screen.getByRole("dialog"));
  expect(details.getByText("На связанных счетах")).toBeTruthy();
  await u.click(details.getByRole("button", { name: "Удалить цель" }));
  await screen.findByText("Цель удалена");
  expect(screen.queryByRole("button", { name: "Цель Отпуск" })).toBeNull();
  expect(accounts()[0].goal_id).toBeNull();
  expect(accounts()[0].balance_cents).toBe("10000000");
});
it("редактирует обе стороны перевода из истории счёта", async () => {
  const u = userEvent.setup();
  opening();
  localSavingsAccount("second", "Вклад", 0);
  localCardSettings("1000", today(), 0);
  const t: AccountTransfer = {
    id: "transfer",
    household_id: "local-family",
    version: 0,
    from_account: "local-savings",
    to_account: "second",
    amount: "20000",
    occurred_on: today(),
    comment: "Переложили",
  };
  localAccountTransfer(t);
  render(<App />);
  await u.click(
    await screen.findByRole("button", { name: "Бюджет", exact: true }),
  );
  await u.click(
    screen.getByRole("button", { name: "Накопления", exact: true }),
  );
  const account = within(screen.getByRole("article", { name: "Счёт Вклад" }));
  await u.click(account.getByText("История"));
  await u.click(account.getByRole("button", { name: "Изменить перевод" }));
  const dialog = within(
    screen.getByRole("dialog", { name: "Перевод между счетами" }),
  );
  await u.clear(dialog.getByLabelText("Сумма, ₽"));
  await u.type(dialog.getByLabelText("Сумма, ₽"), "30000");
  await u.click(dialog.getByRole("button", { name: "Сохранить перевод" }));
  await screen.findByText("Перевод между счетами сохранён");
  expect(accounts().find((a) => a.id === "second")?.balance_cents).toBe(
    "3000000",
  );
  expect(accounts().find((a) => a.id === "local-savings")?.balance_cents).toBe(
    "7000000",
  );
  expect(localSnapshot(currentMonth()).cards?.balance_cents).toBe("100000");
});
it("локальная смена привязки сохраняет историю, не перемещает деньги и проверяет версию", () => {
  const g = goal();
  localGoal(g);
  localSavingsAccount("local-savings", "Накопления", 1, undefined, g.id);
  opening();
  localSavings({
    id: "deposit",
    version: 0,
    account_id: "local-savings",
    kind: "deposit",
    amount: "100",
    occurred_on: today(),
    comment: "",
  });
  const h = { ...goal("goal-b"), name: "Дом" };
  localGoal(h);
  localSavingsAccount("local-savings", "Накопления", 2, undefined, h.id);
  const snapshot = localSnapshot(currentMonth());
  expect(
    snapshot.savings?.entries.find((e) => e.id === "deposit")?.goal_id,
  ).toBe(g.id);
  expect(accounts()[0].goal_id).toBe(h.id);
  expect(() =>
    localSavingsAccount("local-savings", "X", 2, undefined, null),
  ).toThrow("уже изменён");
  expect(accounts()[0].balance_cents).toBe("10010000");
});
