// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Help } from "../src/components/Help";
import { Bullet, bulletScale } from "../src/components/Bullet";
import { Analysis } from "../src/components/Analysis";
import { changeFrom, monthPoint } from "../src/lib/analysis";
import {
  localSnapshot,
  localSavings,
  localSavingsAccount,
} from "../src/lib/demo";
import type { Category } from "../src/types";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("различает незаданный и нулевой лимит; превышение имеет доступное описание", () => {
  expect(bulletScale(50, 100)).toMatchObject({
    fill: 40,
    marker: 80,
    over: false,
  });
  expect(bulletScale(100, null)).toMatchObject({ marker: null, over: false });
  expect(bulletScale(1, 0)).toMatchObject({ marker: 0, over: true });
  render(<Bullet actual={15000} limit={10000} label="Еда" />);
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
    "превышен",
  );
});
it("подсказка открывается по наведению и нажатию, закрывается Escape и нажатием снаружи", async () => {
  const u = userEvent.setup();
  render(<Help label="Баланс">Формула баланса</Help>);
  const b = screen.getByRole("button");
  expect(screen.queryByRole("tooltip")).toBeNull();
  await u.hover(b);
  expect(screen.getByRole("tooltip").textContent).toBe("Формула баланса");
  await u.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  await u.click(b);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("анализ показывает месяцы, категории обоих типов и переход к операциям", async () => {
  const cats: Category[] = [
    {
      id: "food",
      household_id: "f",
      name: "Еда",
      kind: "expense",
      essential: true,
    },
    {
      id: "salary",
      household_id: "f",
      name: "Зарплата",
      kind: "income",
      essential: false,
    },
  ];
  const points = Array.from({ length: 6 }, (_, i) => ({
    month: `2026-${String(i + 5).padStart(2, "0")}`,
    spent: i * 10000,
    earned: 100000,
    summary: [
      {
        category_id: "food",
        kind: "expense" as const,
        cents: String(i * 10000),
      },
      { category_id: "salary", kind: "income" as const, cents: "100000" },
    ],
  }));
  const onOperations = vi.fn();
  const props = { points, cats, loading: false, error: "", onOperations };
  render(<Analysis {...props} />);
  const u = userEvent.setup();
  await u.click(screen.getByText("Суммы по месяцам"));
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(7);
  await u.click(screen.getByRole("button", { name: /Расходы: сентябрь/ }));
  expect(
    screen.getByRole("region", { name: /Категории за сентябрь/ }),
  ).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Операции: Еда" }));
  expect(onOperations).toHaveBeenLastCalledWith("food", "2026-09");
  await u.click(screen.getByRole("button", { name: /Доходы: август/ }));
  await u.click(screen.getByRole("button", { name: "Операции: Зарплата" }));
  expect(onOperations).toHaveBeenLastCalledWith("salary", "2026-08");
  expect(changeFrom(0, 100)).toEqual({ difference: 100, percent: null });
  expect(changeFrom(100, 150)).toEqual({ difference: 50, percent: 50 });
});
it("локальные старые накопления сохраняются, счета независимы и не входят в доходы", () => {
  localStorage.setItem(
    "family-budget.local.v2",
    JSON.stringify({
      revision: 1,
      transactions: [],
      budgets: [],
      savings: [
        {
          id: "old",
          version: 1,
          kind: "opening",
          amount: "1000",
          occurred_on: "2026-10-01",
        },
      ],
    }),
  );
  expect(localSnapshot("2026-10").savings!.accounts![0].balance_cents).toBe(
    "100000",
  );
  localSavingsAccount("travel", "Отпуск", 0);
  expect(() =>
    localSavings({
      id: "new",
      version: 0,
      account_id: "travel",
      kind: "withdrawal",
      amount: "1",
      occurred_on: "2026-10-01",
      comment: "",
    }),
  ).toThrow("недостаточно");
  localSavings({
    id: "new",
    version: 0,
    account_id: "travel",
    kind: "opening",
    amount: "250",
    occurred_on: "2026-10-01",
    comment: "",
  });
  localSavingsAccount("travel", "Путешествия", 1);
  const s = localSnapshot("2026-10");
  expect(s.savings!.accounts!.find((a) => a.id === "travel")).toMatchObject({
    name: "Путешествия",
    balance_cents: "25000",
  });
  expect(s.savings!.balance_cents).toBe("125000");
  expect(monthPoint("2026-10", s)).toMatchObject({ earned: 0, spent: 0 });
});
