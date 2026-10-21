// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionForm } from "../src/components/TransactionForm";
import type { Category, Draft } from "../src/types";
afterEach(cleanup);
const cats: Category[] = [
  {
    id: "food",
    household_id: "f",
    name: "Продукты",
    kind: "expense",
    essential: true,
  },
  {
    id: "gifts",
    household_id: "f",
    name: "Подарки",
    kind: "expense",
    essential: false,
  },
  {
    id: "sport",
    household_id: "f",
    name: "Спорт",
    kind: "expense",
    essential: false,
  },
  {
    id: "salary",
    household_id: "f",
    name: "Зарплата",
    kind: "income",
    essential: false,
  },
];
function setup(initial: Partial<Draft> = {}) {
  const save = vi.fn().mockResolvedValue(true);
  render(
    <TransactionForm
      initial={{
        id: "t",
        version: 0,
        kind: "expense",
        category_id: "",
        amount: "100",
        occurred_on: "2026-10-21",
        comment: "",
        ...initial,
      }}
      cats={cats}
      busy={false}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  return {
    u: userEvent.setup(),
    save,
    combo: screen.getByRole("combobox", { name: "Категория" }),
  };
}
it("ищет по началу без учёта регистра, не по вхождению; выбирает существующую категорию", async () => {
  const { u, save, combo } = setup();
  await u.click(combo);
  expect(screen.getAllByRole("option")).toHaveLength(3);
  await u.type(combo, " п");
  expect(screen.getAllByRole("option").map((el) => el.textContent)).toEqual([
    "Продукты",
    "Подарки",
  ]);
  await u.click(screen.getByRole("option", { name: "Подарки" }));
  expect((combo as HTMLInputElement).value).toBe("Подарки");
  expect(screen.queryByRole("listbox")).toBeNull();
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ category_id: "gifts" }),
  );
});
it("стрелки и Enter выбирают без отправки формы; Escape и Tab закрывают список", async () => {
  const { u, save, combo } = setup();
  await u.click(combo);
  await u.type(combo, "П");
  await u.keyboard("{ArrowDown}{ArrowUp}{ArrowDown}{Enter}");
  expect((combo as HTMLInputElement).value).toBe("Подарки");
  expect(save).not.toHaveBeenCalled();
  await u.keyboard("{ArrowDown}");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  await u.keyboard("{Escape}");
  expect(combo.getAttribute("aria-expanded")).toBe("false");
  await u.click(combo);
  await u.keyboard("{Tab}{Tab}");
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("не сохраняет произвольный текст после изменения выбранной категории", async () => {
  const { u, save, combo } = setup({ category_id: "food", version: 1 });
  expect((combo as HTMLInputElement).value).toBe("Продукты");
  await u.clear(combo);
  await u.type(combo, "родукты");
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(screen.getByRole("status").textContent).toContain("Нет категорий");
  await u.keyboard("{Enter}");
  expect(save).not.toHaveBeenCalled();
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(screen.getByRole("alert").textContent).toBe("Выберите категорию");
  expect(save).not.toHaveBeenCalled();
});
it("смена типа сбрасывает поиск и выбор; доход выбирается из своего списка", async () => {
  const { u, save, combo } = setup({ category_id: "food" });
  await u.clear(combo);
  await u.type(combo, "По");
  await u.click(screen.getByRole("button", { name: "Доход", exact: true }));
  const income = screen.getByRole("combobox", { name: "Категория" });
  expect((income as HTMLInputElement).value).toBe("");
  await u.click(income);
  expect(screen.getAllByRole("option").map((el) => el.textContent)).toEqual([
    "Зарплата",
  ]);
  await u.keyboard("{Enter}");
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "income", category_id: "salary" }),
  );
});
