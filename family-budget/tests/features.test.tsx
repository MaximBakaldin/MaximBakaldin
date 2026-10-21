// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import { localSnapshot } from "../src/lib/demo";
import { currentMonth, shiftMonth } from "../src/lib/dates";
import { dueDate } from "../src/lib/features";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});
describe("Новые сценарии", () => {
  it("создаёт ежемесячный платёж, учитывает расход и отменяет оплату", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      await screen.findByRole("button", { name: "Бюджет", exact: true }),
    );
    await u.click(
      screen.getByRole("button", { name: "Обязательные", exact: true }),
    );
    await u.click(screen.getByRole("button", { name: "Добавить платёж" }));
    await u.type(screen.getByLabelText("Название платежа"), "Интернет");
    await u.type(screen.getByLabelText("Сумма платежа, ₽"), "750,50");
    await u.selectOptions(
      screen.getByLabelText("Категория платежа"),
      "local-2",
    );
    await u.click(screen.getByRole("button", { name: "Сохранить платёж" }));
    await screen.findByText("Обязательный платёж сохранён");
    await u.click(screen.getByRole("button", { name: "Оплатить Интернет" }));
    await u.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
    await screen.findByText("Оплата учтена в расходах");
    expect(
      localSnapshot(currentMonth()).summary.find(
        (s) => s.category_id === "local-2",
      )?.cents,
    ).toBe("75050");
    expect(
      localSnapshot(shiftMonth(currentMonth(), 1)).recurring?.[0].payment,
    ).toBeNull();
    await u.click(
      screen.getByRole("button", { name: "Отменить оплату Интернет" }),
    );
    await screen.findByText("Оплата отменена, расход удалён");
    expect(
      localSnapshot(currentMonth()).summary.find(
        (s) => s.category_id === "local-2",
      )?.cents,
    ).toBe("0");
  });
  it("меняет название, категории и тему; настройки не содержат историю", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      await screen.findByRole("button", { name: "Настройки", exact: true }),
    );
    expect(screen.queryByText("Последние шесть месяцев")).toBeNull();
    expect(screen.queryByText("Экспорт операций")).toBeNull();
    await u.clear(screen.getByLabelText("Название семьи"));
    await u.type(screen.getByLabelText("Название семьи"), "Наш дом");
    await u.click(screen.getByRole("button", { name: "Сохранить название" }));
    await screen.findByText("Название сохранено");
    expect(localSnapshot(currentMonth()).family.name).toBe("Наш дом");
    await u.click(screen.getByRole("button", { name: "Добавить категорию" }));
    await u.type(screen.getByLabelText("Название категории"), "Кофе");
    await u.click(screen.getByRole("button", { name: "Сохранить категорию" }));
    await screen.findByText("Категория сохранена");
    await u.click(
      screen.getByRole("button", { name: "Удалить категорию Кофе" }),
    );
    await screen.findByText("Категория удалена из списка");
    expect(
      localSnapshot(currentMonth()).categories.find((c) => c.name === "Кофе")
        ?.archived,
    ).toBe(true);
    await u.selectOptions(screen.getByLabelText("Тема"), "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("family-budget.theme")).toBe("dark");
  });
  it("сохраняет накопления отдельно и отклоняет снятие сверх баланса", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      await screen.findByRole("button", { name: "Бюджет", exact: true }),
    );
    await u.click(
      screen.getByRole("button", { name: "Накопления", exact: true }),
    );
    await u.click(
      screen.getByRole("button", { name: "Начальный остаток: Накопления" }),
    );
    await u.type(screen.getByLabelText("Сумма перевода, ₽"), "1000");
    await u.click(screen.getByRole("button", { name: "Сохранить перевод" }));
    await screen.findByText("Накопления обновлены");
    await u.click(
      screen.getByRole("button", { name: "Пополнить Накопления", exact: true }),
    );
    await u.type(screen.getByLabelText("Сумма перевода, ₽"), "250,25");
    await u.click(screen.getByRole("button", { name: "Сохранить перевод" }));
    await screen.findByText("Накопления обновлены");
    expect(localSnapshot(currentMonth()).savings).toMatchObject({
      balance_cents: "125025",
      transfer_cents: "25025",
    });
    expect(
      localSnapshot(currentMonth()).summary.every((s) => s.cents === "0"),
    ).toBe(true);
    await u.click(
      screen.getByRole("button", {
        name: "Снять со счёта Накопления",
        exact: true,
      }),
    );
    await u.type(screen.getByLabelText("Сумма перевода, ₽"), "2000");
    await u.click(screen.getByRole("button", { name: "Сохранить перевод" }));
    expect(
      (await within(screen.getByRole("dialog")).findByRole("alert"))
        .textContent,
    ).toContain("недостаточно");
    expect(localSnapshot(currentMonth()).savings?.balance_cents).toBe("125025");
  });
  it("редактирует расход из журнала с пересчётом итогов", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      await screen.findByRole("button", { name: "Добавить операцию" }),
    );
    await u.type(screen.getByLabelText("Сумма, ₽"), "120");
    await u.click(screen.getByRole("button", { name: "Продукты" }));
    await u.click(
      screen.getByRole("button", { name: "Сохранить", exact: true }),
    );
    await screen.findByText("Операция сохранена");
    await u.click(
      screen.getByRole("button", { name: "Изменить", exact: true }),
    );
    await u.clear(screen.getByLabelText("Сумма, ₽"));
    await u.type(screen.getByLabelText("Сумма, ₽"), "180,10");
    await u.click(
      screen.getByRole("button", { name: "Сохранить", exact: true }),
    );
    await screen.findByText("Операция сохранена");
    expect(
      localSnapshot(currentMonth()).summary.find(
        (s) => s.category_id === "local-0",
      )?.cents,
    ).toBe("18010");
    expect(
      within(screen.getByRole("navigation"))
        .getByRole("button", { name: "Анализ" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});
it("переносит 31 число на последний день короткого месяца", () => {
  expect(dueDate("2026-02", 31)).toBe("2026-02-28");
  expect(dueDate("2028-02", 31)).toBe("2028-02-29");
  expect(dueDate("2026-04", 31)).toBe("2026-04-30");
});
