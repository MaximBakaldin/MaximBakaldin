// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import { BudgetRow } from "../src/components/BudgetRow";
afterEach(cleanup);
beforeEach(() => localStorage.clear());
describe("Локальный бюджет", () => {
  it("сохраняет операцию с копейками и восстанавливает после перезагрузки", async () => {
    const u = userEvent.setup();
    const view = render(<App />);
    await u.click(
      await screen.findByRole("button", { name: "Добавить операцию" }),
    );
    await u.type(screen.getByLabelText("Сумма, ₽"), "100,10");
    await u.click(
      screen.getByRole("button", { name: "Продукты", exact: true }),
    );
    await u.type(screen.getByLabelText("Комментарий"), "Покупка");
    await u.click(
      screen.getByRole("button", { name: "Сохранить", exact: true }),
    );
    await screen.findByText("Операция сохранена");
    expect(screen.getByText("Покупка")).toBeTruthy();
    view.unmount();
    render(<App />);
    await screen.findByText("Всё под контролем");
    expect(screen.getAllByText(/100,10/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "Анализ" }));
    await u.click(
      screen.getByRole("button", { name: "Операции", exact: true }),
    );
    await u.click(screen.getByRole("button", { name: "Изменить" }));
    expect(screen.queryByRole("navigation")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Отмена" }));
    await u.click(screen.getByRole("button", { name: "Главная" }));
    await u.click(screen.getByRole("button", { name: "Добавить операцию" }));
    expect((screen.getByLabelText("Сумма, ₽") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen.getByRole("heading", { name: "Новая операция" }),
    ).toBeTruthy();
  });
  it("не сохраняет третью цифру после запятой", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      await screen.findByRole("button", { name: "Добавить операцию" }),
    );
    await u.type(screen.getByLabelText("Сумма, ₽"), "1.001");
    await u.click(
      screen.getByRole("button", { name: "Продукты", exact: true }),
    );
    await u.click(
      screen.getByRole("button", { name: "Сохранить", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Введите сумму с точностью до копеек",
    );
    expect(localStorage.getItem("family-budget.local.v2")).toBeNull();
  });
  it("обновляет чистое поле плана и предупреждает о конфликте с вводом", async () => {
    const u = userEvent.setup();
    const props = {
      name: "Еда",
      amount: 10000,
      spent: 0,
      version: 1,
      busy: false,
      onSave: async () => true,
    };
    const view = render(<BudgetRow {...props} />);
    view.rerender(<BudgetRow {...props} amount={20000} version={2} />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("План: Еда") as HTMLInputElement).value,
      ).toBe("200.00"),
    );
    await u.clear(screen.getByLabelText("План: Еда"));
    await u.type(screen.getByLabelText("План: Еда"), "350");
    view.rerender(<BudgetRow {...props} amount={30000} version={3} />);
    expect(screen.getByText(/План изменён на другом устройстве/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Сохранить" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
