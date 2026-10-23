// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import * as local from "../src/lib/demo";
import { currentMonth, shiftMonth } from "../src/lib/dates";
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("задаёт общий лимит, показывает остаток и не сохраняет превышение категории", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Бюджет", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: "Лимиты", exact: true }));
  const input = screen.getByLabelText("План: Общий лимит");
  await user.type(input, "1000");
  await user.click(
    within(input.closest("article")!).getByRole("button", {
      name: "Сохранить",
    }),
  );
  await screen.findByText("Общий лимит сохранён");
  const category = screen.getByLabelText("План: Продукты");
  await user.clear(category);
  await user.type(category, "700");
  await user.click(
    within(category.closest("article")!).getByRole("button", {
      name: "Сохранить",
    }),
  );
  await screen.findByText("План сохранён");
  expect(screen.getByText(/Осталось/).textContent).toMatch(/300,00/);
  const second = screen.getByLabelText("План: Дети");
  await user.clear(second);
  await user.type(second, "300.01");
  await user.click(
    within(second.closest("article")!).getByRole("button", {
      name: "Сохранить",
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Для этой категории доступно",
  );
  expect(local.localSnapshot(currentMonth()).budgets).toHaveLength(1);
  await user.clear(input);
  await user.type(input, "699");
  await user.click(
    within(input.closest("article")!).getByRole("button", {
      name: "Сохранить",
    }),
  );
  expect(
    await screen.findByText(/Сначала уменьшите лимиты категорий/),
  ).toBeTruthy();
  expect(local.localSnapshot(currentMonth()).monthly_budget?.amount).toBe(
    "1000.00",
  );
});
it("локальные проверки сохраняются после перезагрузки и работают без интерфейса", () => {
  const month = currentMonth();
  local.localBudget("local-0", month, "100", 0);
  expect(() => local.localMonthlyBudget(month, "99", 0)).toThrow("превышает");
  local.localMonthlyBudget(month, "100", 0);
  expect(() => local.localBudget("local-1", month, "0.01", 0)).toThrow(
    "превышает",
  );
  expect(() => local.localMonthlyBudget(month, "200", 0)).toThrow(
    "уже изменён",
  );
  local.localBudget("local-0", month, "50", 1);
  local.localBudget("local-1", month, "50", 0);
  expect(local.localSnapshot(month).monthly_budget?.amount).toBe("100.00");
});
it("копирование в демо наследует общий лимит, а при превышении не оставляет частичных изменений", () => {
  const month = currentMonth(),
    prev = shiftMonth(month, -1);
  local.localMonthlyBudget(prev, "100", 0);
  local.localBudget("local-0", prev, "100", 0);
  local.localBudget("local-1", month, "50", 0);
  expect(() => local.localCopy(month)).toThrow("превышает");
  expect(local.localSnapshot(month).monthly_budget).toBeNull();
  expect(local.localSnapshot(month).budgets).toHaveLength(1);
  local.localBudget("local-1", month, "0", 1);
  expect(local.localCopy(month)).toBe(1);
  expect(local.localSnapshot(month).monthly_budget?.amount).toBe("100.00");
});
