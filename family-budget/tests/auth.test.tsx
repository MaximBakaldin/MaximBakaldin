// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../src/types";
const mock = vi.hoisted(() => ({
  callback: (event: string, session: { user: { id: string } } | null) => {
    void event;
    void session;
  },
  load: vi.fn(),
  history: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
}));
vi.mock("../src/db", () => {
  const auth = {
    onAuthStateChange: (callback: typeof mock.callback) => {
      mock.callback = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    getSession: async () => ({
      data: { session: { user: { id: "A" } } },
      error: null,
    }),
  };
  const channel = { on: () => channel, subscribe: () => channel };
  const client = {
    auth,
    channel: () => channel,
    removeChannel: async () => {},
  };
  return {
    configured: true,
    configurationError: false,
    supabase: client,
    client: () => client,
  };
});
vi.mock("../src/lib/api", () => ({
  snapshot: mock.load,
  history: mock.history,
}));
import App from "../src/App";
afterEach(cleanup);
const snapshot: Snapshot = {
  family: { id: "family-a", name: "Семья А", created_by: "A" },
  categories: [],
  members: [],
  budgets: [],
  summary: [
    { category_id: "private-category", kind: "expense", cents: "12345" },
  ],
  revision: 0,
};
describe("Изоляция сессий", () => {
  it("немедленно убирает данные A при переходе к B, даже при ошибке загрузки B", async () => {
    mock.load.mockResolvedValue(snapshot);
    render(<App />);
    await screen.findAllByText(/123,45/);
    mock.load.mockRejectedValue(new Error("Проверочная ошибка сети"));
    await act(async () => mock.callback("SIGNED_IN", { user: { id: "B" } }));
    expect(screen.queryAllByText(/123,45/)).toHaveLength(0);
    expect(await screen.findByText(/Проверочная ошибка сети/)).toBeTruthy();
  });
  it("поздний ответ A не возвращает его данные после входа B", async () => {
    let resolveA: (s: Snapshot) => void = () => {};
    mock.load.mockImplementationOnce(
      () =>
        new Promise<Snapshot>((resolve) => {
          resolveA = resolve;
        }),
    );
    render(<App />);
    await screen.findByText("Загружаем бюджет…");
    mock.load.mockResolvedValue(null);
    await act(async () => mock.callback("SIGNED_IN", { user: { id: "B" } }));
    await screen.findByText("Ваше общее пространство");
    await act(async () => resolveA(snapshot));
    expect(screen.queryAllByText(/123,45/)).toHaveLength(0);
    expect(screen.getByText("Ваше общее пространство")).toBeTruthy();
  });
});
