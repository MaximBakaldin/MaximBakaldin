// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import {
  localSave,
  newDraft,
  localRecurring,
  localPay,
  localSnapshot,
  localSavings,
} from "../src/lib/demo";
import { currentMonth, today } from "../src/lib/dates";
import { currency } from "../src/lib/money";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function payment(id: string, amount: string, active = true) {
  localRecurring(
    {
      id,
      version: 0,
      name: id,
      amount,
      category_id: "local-2",
      due_day: 1,
      active,
    },
    currentMonth(),
  );
}
async function freeAmount() {
  const help = await screen.findByRole("button", {
    name: "Подсказка: Остаток на счетах",
  });
  return help.closest("article")!.querySelector("strong")!;
}
it("резервирует неоплаченные обязательства, учитывает переводы и не вычитает оплату дважды", async () => {
  const u = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  localSave({
    ...newDraft(),
    category_id: "local-7",
    kind: "income",
    amount: "1000",
  });
  localSave({ ...newDraft(), category_id: "local-0", amount: "100" });
  payment("Аренда", "200");
  payment("Интернет", "50");
  payment("Удалённый", "300", false);
  localPay(
    localSnapshot(currentMonth()).recurring!.find(
      (r) => r.name === "Интернет",
    )!,
    currentMonth(),
    today(),
  );
  for (const [kind, amount] of [
    ["deposit", "200"],
    ["withdrawal", "50"],
  ] as const) {
    localSavings({
      id: crypto.randomUUID(),
      version: 0,
      account_id: "local-savings",
      kind,
      amount,
      occurred_on: today(),
      comment: "",
    });
  }
  render(<App />);
  expect((await freeAmount()).textContent).toBe(currency(50000));
  const nav = screen.getByRole("navigation");
  expect(
    within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["Главная", "Бюджет", "+", "Анализ", "Настройки"]);
  await u.click(within(nav).getByRole("button", { name: "Бюджет" }));
  const tabs = screen.getByRole("group", { name: "Разделы бюджета" });
  expect(
    within(tabs)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["Обязательные", "Накопления", "Лимиты"]);
  expect(
    within(tabs)
      .getByRole("button", { name: "Обязательные" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await u.click(screen.getByRole("button", { name: "Оплатить Аренда" }));
  await screen.findByText("Оплата учтена в расходах");
  await u.click(within(nav).getByRole("button", { name: "Главная" }));
  expect((await freeAmount()).textContent).toBe(currency(50000));
  await u.click(within(nav).getByRole("button", { name: "Бюджет" }));
  await u.click(screen.getByRole("button", { name: "Отменить оплату Аренда" }));
  await screen.findByText("Оплата отменена, расход удалён");
  await u.click(within(nav).getByRole("button", { name: "Главная" }));
  expect((await freeAmount()).textContent).toBe(currency(50000));
});
it("показывает нехватку денег на обязательства отрицательной суммой", async () => {
  payment("Аренда", "200,50");
  render(<App />);
  const amount = await freeAmount();
  expect(amount.textContent).toBe(currency(-20050));
  expect(amount.className).toBe("danger");
});
