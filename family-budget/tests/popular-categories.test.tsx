// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { popularCategories } from "../src/lib/categories";
import { TransactionForm } from "../src/components/TransactionForm";
import {
  localCategoryUsage,
  localDelete,
  localHistory,
  localSave,
  newDraft,
} from "../src/lib/demo";
import type { Category } from "../src/types";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const cats: Category[] = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  household_id: "f",
  name: `Категория ${i}`,
  kind: "expense",
  essential: false,
  archived: i === 8,
}));
const usage = [
  { category_id: "7", uses: 10 },
  { category_id: "6", uses: "8" },
  { category_id: "8", uses: 1000 },
];
it("даёт шесть активных категорий по числу операций, дополняет список при короткой истории", () => {
  expect(popularCategories(cats, usage).map((c) => c.id)).toEqual([
    "7",
    "6",
    "0",
    "1",
    "2",
    "3",
  ]);
  expect(popularCategories(cats.slice(0, 2), []).map((c) => c.id)).toEqual([
    "0",
    "1",
  ]);
});
it("считает частоту по всей истории, а не по сумме, и учитывает удаление операций", () => {
  localSave({
    ...newDraft(),
    category_id: "local-0",
    amount: "100000",
  });
  localSave({
    ...newDraft(),
    category_id: "local-1",
    amount: "1",
    occurred_on: "2025-01-01",
  });
  localSave({ ...newDraft(), category_id: "local-1", amount: "1" });
  expect(localCategoryUsage()).toEqual([
    { category_id: "local-0", uses: 1 },
    { category_id: "local-1", uses: 2 },
  ]);
  localDelete(
    localHistory(
      newDraft().occurred_on.slice(0, 7),
      { category: "local-0", search: "" },
      0,
    ).rows[0],
  );
  expect(localCategoryUsage()).toEqual([{ category_id: "local-1", uses: 2 }]);
});
it("быстрая кнопка синхронизирует список, не отправляет форму; доходы имеют свои кнопки", async () => {
  const u = userEvent.setup(),
    save = vi.fn().mockResolvedValue(true);
  render(
    <TransactionForm
      initial={{ ...newDraft(), amount: "123" }}
      cats={[
        ...cats,
        {
          id: "salary",
          household_id: "f",
          name: "Зарплата",
          kind: "income",
          essential: false,
        },
      ]}
      categoryUsage={usage}
      busy={false}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  const group = screen.getByRole("group", { name: "Быстрый выбор категории" });
  expect(within(group).getAllByRole("button")).toHaveLength(6);
  await u.click(within(group).getByRole("button", { name: "Категория 7" }));
  expect(save).not.toHaveBeenCalled();
  expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
    "Категория 7",
  );
  await u.click(screen.getByRole("combobox"));
  await u.click(screen.getByRole("option", { name: "Категория 6" }));
  expect(
    within(group)
      .getByRole("button", { name: "Категория 6" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ category_id: "6", kind: "expense" }),
  );
  await u.click(screen.getByRole("button", { name: "Доход", exact: true }));
  expect(
    within(group)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["Зарплата"]);
  await u.click(within(group).getByRole("button", { name: "Зарплата" }));
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ category_id: "salary", kind: "income" }),
  );
});
