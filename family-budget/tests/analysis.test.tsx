// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Help } from "../src/components/Help";
import { Bullet, bulletScale } from "../src/components/Bullet";
import { Analysis } from "../src/components/Analysis";
import { changeFrom, monthPoint } from "../src/lib/analysis";
import {
  localSave,
  newDraft,
  localSnapshot,
  localSavings,
  localSavingsAccount,
} from "../src/lib/demo";
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
it("анализ выбирает месяц и передаёт точные границы в операции", async () => {
  localSave({
    ...newDraft(),
    category_id: "local-0",
    amount: "100",
    occurred_on: "2026-08-15",
  });
  localSave({
    ...newDraft(),
    category_id: "local-0",
    amount: "200",
    occurred_on: "2026-09-15",
  });
  localSave({
    ...newDraft(),
    category_id: "local-7",
    kind: "income",
    amount: "1000",
    occurred_on: "2026-08-20",
  });
  const onOperations = vi.fn();
  render(
    <Analysis
      family="local-family"
      month="2026-10"
      revision={1}
      cats={localSnapshot("2026-10").categories}
      onOperations={onOperations}
    />,
  );
  const u = userEvent.setup();
  await screen.findByRole("group", { name: "Доходы и расходы за период" });
  await u.click(screen.getByRole("button", { name: /^сент/ }));
  await u.click(screen.getByRole("button", { name: "Операции: Продукты" }));
  expect(onOperations).toHaveBeenLastCalledWith("local-0", {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  await u.click(screen.getByRole("button", { name: /^авг/ }));
  await u.click(screen.getByRole("button", { name: "Доходы", exact: true }));
  await u.click(screen.getByRole("button", { name: "Операции: Зарплата" }));
  expect(onOperations).toHaveBeenLastCalledWith("local-7", {
    from: "2026-08-01",
    to: "2026-08-31",
  });
  expect(changeFrom(0, 100)).toEqual({ difference: 100, percent: null });
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
it("фильтрует месяц, неделю и произвольный период; неверные даты не рушат экран", async () => {
  const u = userEvent.setup(),
    onOperations = vi.fn();
  localSave({
    ...newDraft(),
    category_id: "local-0",
    amount: "200",
    occurred_on: "2026-10-02",
  });
  localSave({
    ...newDraft(),
    category_id: "local-0",
    amount: "300",
    occurred_on: "2026-10-20",
  });
  render(
    <Analysis
      family="local-family"
      month="2026-10"
      revision={1}
      cats={localSnapshot("2026-10").categories}
      onOperations={onOperations}
    />,
  );
  await screen.findByRole("group", { name: "Доходы и расходы за период" });
  await u.selectOptions(screen.getByLabelText("Период анализа"), "month");
  await screen.findByRole("group", { name: "Доходы и расходы за период" });
  expect(
    screen.getAllByRole("button", { name: /расходы .*доходы/ }),
  ).toHaveLength(31);
  await u.selectOptions(screen.getByLabelText("Период анализа"), "week");
  fireEvent.change(screen.getByLabelText("День выбранной недели"), {
    target: { value: "2026-10-02" },
  });
  await screen.findByRole("button", { name: "Операции: Продукты" });
  await u.click(screen.getByRole("button", { name: "Операции: Продукты" }));
  expect(onOperations).toHaveBeenLastCalledWith("local-0", {
    from: "2026-09-28",
    to: "2026-10-04",
  });
  await u.selectOptions(screen.getByLabelText("Период анализа"), "custom");
  fireEvent.change(screen.getByLabelText("С", { exact: true }), {
    target: { value: "2026-10-20" },
  });
  fireEvent.change(screen.getByLabelText("По", { exact: true }), {
    target: { value: "2026-10-20" },
  });
  await screen.findByRole("button", { name: "Операции: Продукты" });
  await u.click(screen.getByRole("button", { name: "Операции: Продукты" }));
  expect(onOperations).toHaveBeenLastCalledWith("local-0", {
    from: "2026-10-20",
    to: "2026-10-20",
  });
  fireEvent.change(screen.getByLabelText("По", { exact: true }), {
    target: { value: "2026-10-01" },
  });
  expect(screen.getByRole("alert").textContent).toContain("начало не позже");
});
