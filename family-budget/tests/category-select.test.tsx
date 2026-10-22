// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionForm } from "../src/components/TransactionForm";
import { localSnapshot, newDraft } from "../src/lib/demo";
afterEach(cleanup);
it("экран всех категорий ищет по началу, сохраняет введённую сумму и комментарий", async () => {
  const save = vi.fn().mockResolvedValue(true),
    u = userEvent.setup();
  render(
    <TransactionForm
      initial={newDraft()}
      cats={localSnapshot("2026-10").categories}
      busy={false}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  await u.type(screen.getByLabelText("Сумма, ₽"), "123,45");
  await u.type(screen.getByLabelText("Комментарий"), "Покупка");
  await u.click(screen.getByRole("button", { name: "Ещё" }));
  expect(
    screen.queryByRole("button", { name: "Сохранить", exact: true }),
  ).toBeNull();
  await u.type(screen.getByRole("searchbox"), "п");
  const choices = within(
    screen.getByRole("group", { name: "Все категории по популярности" }),
  );
  expect(choices.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Продукты›",
    "Прочее›",
  ]);
  await u.click(choices.getByRole("button", { name: /Прочее/ }));
  expect((screen.getByLabelText("Сумма, ₽") as HTMLInputElement).value).toBe(
    "123,45",
  );
  expect((screen.getByLabelText("Комментарий") as HTMLInputElement).value).toBe(
    "Покупка",
  );
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: "123,45",
      category_id: "local-6",
      comment: "Покупка",
    }),
  );
});
it("возврат из списка не выбирает категорию, произвольный текст не сохраняется", async () => {
  const save = vi.fn(),
    u = userEvent.setup();
  render(
    <TransactionForm
      initial={{ ...newDraft(), amount: "100" }}
      cats={localSnapshot("2026-10").categories}
      busy={false}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Ещё" }));
  await u.type(screen.getByRole("searchbox"), "родукты");
  expect(screen.getByRole("status").textContent).toBe("Категории не найдены");
  await u.click(screen.getByRole("button", { name: "← Назад" }));
  await u.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
  expect(screen.getByRole("alert").textContent).toBe("Выберите категорию");
  expect(save).not.toHaveBeenCalled();
});
