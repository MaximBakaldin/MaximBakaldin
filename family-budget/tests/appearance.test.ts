// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readAppearance, saveAppearance, watchTheme } from "../src/lib/theme";
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("сохраняет прежнюю тему до личного выбора и независимо хранит два аккаунта", () => {
  localStorage.setItem("family-budget.theme", "dark");
  expect(readAppearance("A")).toEqual({ theme: "dark", style: "classic" });
  saveAppearance("A", { theme: "system", style: "plum" });
  saveAppearance("B", { theme: "light", style: "sand" });
  expect(readAppearance("A")).toEqual({ theme: "system", style: "plum" });
  expect(readAppearance("B")).toEqual({ theme: "light", style: "sand" });
  expect(localStorage.getItem("family-budget.theme")).toBe("dark");
});

it("системная тема меняется вместе с устройством, ручная тема сохраняется", () => {
  const system = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => system);
  saveAppearance("A", { theme: "system", style: "forest" });
  const stop = watchTheme("A");
  try {
    system.matches = true;
    system.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.style).toBe("forest");
    saveAppearance("A", { theme: "light", style: "forest" });
    system.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBe("light");
    saveAppearance("B", { theme: "dark", style: "plum" });
    expect(document.documentElement.dataset.style).toBe("forest");
  } finally {
    stop();
  }
});

it("изменение в другой вкладке обновляет только тот же аккаунт; повреждённые настройки безопасны", () => {
  const stop = watchTheme("A");
  try {
    localStorage.setItem(
      "family-budget.appearance.A",
      JSON.stringify({ theme: "dark", style: "blue" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "family-budget.appearance.B" }),
    );
    expect(document.documentElement.dataset.style).toBe("classic");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "family-budget.appearance.A" }),
    );
    expect(document.documentElement.dataset.style).toBe("blue");
    localStorage.setItem("family-budget.appearance.A", "invalid");
    expect(readAppearance("A")).toEqual({ theme: "system", style: "classic" });
    localStorage.setItem(
      "family-budget.appearance.A",
      JSON.stringify({ theme: "unknown", style: "unknown" }),
    );
    expect(readAppearance("A")).toEqual({ theme: "system", style: "classic" });
  } finally {
    stop();
  }
});
