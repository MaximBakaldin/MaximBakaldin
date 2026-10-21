import { expect, it } from "vitest";
import { calculatedSavings, rateUnits } from "../src/lib/interest";
import type { SavingsEntry } from "../src/types";
const opening: SavingsEntry = {
  id: "o",
  account_id: "a",
  household_id: "h",
  kind: "opening",
  amount: "100000",
  occurred_on: "2024-02-01",
  comment: null,
  user_id: "u",
  updated_by: "u",
  version: 1,
};
it("ежедневная капитализация, високосный год и отсечение текущего дня", () => {
  const a = {
    id: "a",
    annual_rate: 36.6,
    interest_start: "2024-02-01",
    interest_frequency: "daily" as const,
  };
  const ledger = calculatedSavings([opening], a, "2024-12-31", "2024-02-03");
  expect(
    ledger.filter((e) => e.kind === "interest").map((e) => e.amount),
  ).toEqual(["100.00", "100.10"]);
  expect(calculatedSavings([opening], a, "2024-02-01", "2024-02-01")).toEqual([
    opening,
  ]);
});
it("ежемесячные проценты доступны только после завершения месяца; ставка точная", () => {
  const a = {
    id: "a",
    annual_rate: "36,6",
    interest_start: "2024-02-01",
    interest_frequency: "monthly" as const,
  };
  expect(
    calculatedSavings([opening], a, "2024-02-29", "2024-02-29"),
  ).toHaveLength(1);
  expect(
    calculatedSavings([opening], a, "2024-02-29", "2024-03-01")[1].amount,
  ).toBe("2900.00");
  expect(rateUnits("12,1234")).toBe(121234);
  expect(() => rateUnits("12.12345")).toThrow();
  expect(() => rateUnits("-1")).toThrow();
});
