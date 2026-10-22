// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import {
  localSave,
  localSavings,
  localJournal,
  localAnalysis,
  localSnapshot,
  localRecurring,
  newDraft,
} from "../src/lib/demo";
import { buildTrend, monthRange, weekRange } from "../src/lib/analysis";
import { currentMonth, today, shiftMonth } from "../src/lib/dates";
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("период включает обе границы, заполняет пустые дни и не считает переводы доходом", () => {
  expect(monthRange("2024-02").to).toBe("2024-02-29");
  expect(weekRange("2026-03-01")).toEqual({
    from: "2026-02-23",
    to: "2026-03-01",
  });
  for (const date of ["2026-02-28", "2026-03-01", "2026-03-03", "2026-03-04"])
    localSave({
      ...newDraft(),
      category_id: "local-0",
      amount: "1.10",
      occurred_on: date,
    });
  localSavings({
    id: "s",
    version: 0,
    kind: "deposit",
    amount: "500",
    occurred_on: "2026-03-01",
    account_id: "local-savings",
    comment: "",
  });
  const range = { from: "2026-03-01", to: "2026-03-03" };
  const rows = localAnalysis(range, true),
    points = buildTrend(rows, range, true);
  expect(points.map((p) => p.spent)).toEqual([110, 0, 110]);
  expect(points.every((p) => p.earned === 0)).toBe(true);
  expect(
    localJournal("2026-03", { category: "", search: "", range }, 0).count,
  ).toBe(3);
  expect(
    localJournal("2026-03", { category: "local-0", search: "", range }, 0)
      .count,
  ).toBe(2);
});
it("единый журнал пагинирует движения и расходы, не теряя строки с одинаковой датой", () => {
  for (let i = 0; i < 35; i++)
    localSave({ ...newDraft(), category_id: "local-0", amount: "1" });
  localSavings({
    id: "s",
    version: 0,
    kind: "deposit",
    amount: "500",
    occurred_on: today(),
    account_id: "local-savings",
    comment: "100% взнос",
  });
  const filter = { category: "", search: "" },
    a = localJournal(currentMonth(), filter, 0),
    b = localJournal(currentMonth(), filter, 30);
  expect(a.count).toBe(36);
  expect(a.rows.length).toBe(30);
  expect(b.rows.length).toBe(6);
  expect(new Set([...a.rows, ...b.rows].map((r) => r.source + r.id)).size).toBe(
    36,
  );
  expect(
    localJournal(currentMonth(), { category: "", search: "100%" }, 0).rows[0]
      .source,
  ).toBe("savings");
});
it("редактирует снятие из общего журнала и обновляет баланс", async () => {
  localSavings({
    id: "opening",
    version: 0,
    kind: "opening",
    amount: "1000",
    occurred_on: today(),
    account_id: "local-savings",
    comment: "",
  });
  localSavings({
    id: "withdrawal",
    version: 0,
    kind: "withdrawal",
    amount: "100",
    occurred_on: today(),
    account_id: "local-savings",
    comment: "Наличные",
  });
  const u = userEvent.setup();
  render(<App />);
  await u.click(
    await screen.findByRole("button", { name: "Анализ", exact: true }),
  );
  await u.click(screen.getByRole("button", { name: "Операции", exact: true }));
  const row = screen
    .getByText("Снятие со счёта · Накопления")
    .closest("article")!;
  await u.click(within(row).getByRole("button", { name: "Изменить" }));
  await u.clear(screen.getByLabelText("Сумма перевода, ₽"));
  await u.type(screen.getByLabelText("Сумма перевода, ₽"), "150.50");
  await u.click(screen.getByRole("button", { name: "Сохранить перевод" }));
  await screen.findByText("Движение сохранено");
  expect(localSnapshot(currentMonth()).savings?.balance_cents).toBe("84950");
});
it("оплачивает в одно нажатие; изменение суммы оплаты сохраняет сумму будущих повторений", async () => {
  localRecurring(
    {
      id: "rent",
      version: 0,
      name: "Аренда",
      amount: "1000",
      category_id: "local-2",
      due_day: 1,
      active: true,
    },
    currentMonth(),
  );
  const u = userEvent.setup();
  render(<App />);
  await u.click(
    await screen.findByRole("button", { name: "Бюджет", exact: true }),
  );
  await u.click(screen.getByRole("button", { name: "Оплатить Аренда" }));
  await screen.findByText("Оплата учтена в расходах");
  expect(
    screen.queryByRole("button", { name: "Подтвердить оплату" }),
  ).toBeNull();
  await u.click(screen.getByRole("button", { name: "Изменить оплату" }));
  await u.clear(screen.getByLabelText("Сумма, ₽"));
  await u.type(screen.getByLabelText("Сумма, ₽"), "950");
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  await screen.findByText("Операция сохранена");
  expect(localSnapshot(currentMonth()).recurring?.[0].payment?.amount).toBe(
    "950.00",
  );
  expect(
    String(localSnapshot(shiftMonth(currentMonth(), 1)).recurring?.[0].amount),
  ).toBe("1000");
  expect(screen.getByRole("group", { name: "Разделы бюджета" })).toBeTruthy();
});
it("категория главной открывает структурированную расшифровку", async () => {
  localSave({ ...newDraft(), category_id: "local-0", amount: "500" });
  const u = userEvent.setup();
  render(<App />);
  await u.click(
    await screen.findByRole("button", { name: "Расшифровка: Продукты" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Бюджет и факт")).toBeTruthy();
  expect(within(dialog).getByText("Обязательные к оплате")).toBeTruthy();
  await u.click(
    within(dialog).getByRole("button", { name: "Посмотреть операции" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect((screen.getByLabelText("Категория") as HTMLSelectElement).value).toBe(
    "local-0",
  );
});
