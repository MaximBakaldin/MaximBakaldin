// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstallApp } from "../src/components/InstallApp";
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows instructions for Safari and Android without install prompt", async () => {
  const user = userEvent.setup();
  render(<InstallApp />);
  await user.click(screen.getByRole("button", { name: "Как установить" }));
  expect(screen.getByText("iPhone · Safari")).toBeTruthy();
  expect(screen.getByText("Android · Chrome")).toBeTruthy();
});
it("opens the browser installation dialog and hides after installation", async () => {
  const user = userEvent.setup();
  render(<InstallApp />);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) },
  );
  act(() => {
    window.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  await user.click(screen.getByRole("button", { name: "Установить" }));
  expect(prompt).toHaveBeenCalledTimes(1);
  act(() => {
    window.dispatchEvent(new Event("appinstalled"));
  });
  expect(screen.queryByLabelText("Установка приложения")).toBeNull();
});
