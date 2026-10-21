import { describe, expect, it } from "vitest";
import {
  currency,
  decimal,
  parseMoney,
  summaryCents,
  total,
} from "../src/lib/money";
import { validDate, shiftMonth, monthBounds } from "../src/lib/dates";
import { csvCell, transactionsCsv } from "../src/lib/csv";
describe("Деньги", () => {
  it("суммирует копейки точно", () => {
    expect(total([parseMoney("100,10"), parseMoney("200.20")])).toBe(30030);
    expect(decimal(30030)).toBe("300.30");
    expect(currency(30030)).toContain("300,30");
  });
  it.each(["", "-1", "0", "1.001", "1e3", "Infinity", "1000000000000", "NaN"])(
    "отклоняет некорректную сумму %s",
    (value) => expect(() => parseMoney(value)).toThrow(),
  );
  it("разрешает нулевой план и отрицательную разницу", () => {
    expect(parseMoney("0", true)).toBe(0);
    expect(decimal(-1)).toBe("-0.01");
  });
  it("не скрывает переполнение итогов", () => {
    expect(() => summaryCents("9007199254740992")).toThrow();
    expect(() => total([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});
describe("Календарь", () => {
  it("учитывает високосный год и границы года", () => {
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2025-02-29")).toBe(false);
    expect(validDate("2026-04-31")).toBe(false);
    expect(validDate("")).toBe(false);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2026-12")).toEqual({
      start: "2026-12-01",
      end: "2027-01-01",
    });
  });
});
describe("CSV", () => {
  it.each(["=1+1", " +SUM(A1)", "\t=CMD()", "@hello", "-1+2", "\ntext"])(
    "нейтрализует формулы %s",
    (value) => expect(csvCell(value)).toBe(`"'${value}"`),
  );
  it("сохраняет кавычки и переносы", () => {
    expect(csvCell('магазин "А"\nеда')).toBe('"магазин ""А""\nеда"');
    expect(transactionsCsv([], [])).toMatch(/^\ufeff/);
  });
});
