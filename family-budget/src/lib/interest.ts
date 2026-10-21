import type { SavingsAccountData, SavingsEntry } from "../types";
import { today, validDate } from "./dates";
import { decimal, parseMoney } from "./money";
export type InterestSettings = Pick<
  SavingsAccountData,
  "annual_rate" | "interest_start" | "interest_frequency"
>;
export function rateUnits(rate: string | number | null | undefined) {
  if (rate == null || rate === "") return 0;
  const text = String(rate).replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(text) || Number(text) > 1000)
    throw new Error("Ставка: от 0 до 1000%, до четырёх знаков после запятой");
  return Math.round(Number(text) * 10000);
}
export function validateInterest(a: InterestSettings) {
  const rate = rateUnits(a.annual_rate);
  if (rate && (!a.interest_start || !validDate(a.interest_start)))
    throw new Error("Укажите дату начала начисления");
  if (
    a.interest_frequency &&
    !["daily", "monthly"].includes(a.interest_frequency)
  )
    throw new Error("Выберите период начисления");
}
export function calculatedSavings(
  entries: SavingsEntry[],
  a: InterestSettings & { id: string },
  until: string,
  asOf = today(),
): SavingsEntry[] {
  const list = entries.filter(
    (e) =>
      e.account_id === a.id && e.kind !== "interest" && e.occurred_on <= until,
  );
  const units = rateUnits(a.annual_rate);
  if (
    !units ||
    !a.interest_start ||
    a.interest_start > until ||
    a.interest_start >= asOf
  )
    return list;
  const daily = new Map<string, bigint>();
  let balance = 0n;
  for (const e of list) {
    const amount =
      BigInt(parseMoney(e.amount)) * (e.kind === "withdrawal" ? -1n : 1n);
    if (e.occurred_on < a.interest_start) balance += amount;
    else daily.set(e.occurred_on, (daily.get(e.occurred_on) ?? 0n) + amount);
  }
  let accrual = 0n;
  const out = [...list],
    date = new Date(a.interest_start + "T12:00:00Z");
  for (
    let d = a.interest_start;
    d <= until && d < asOf;
    date.setUTCDate(date.getUTCDate() + 1), d = date.toISOString().slice(0, 10)
  ) {
    balance += daily.get(d) ?? 0n;
    const year = date.getUTCFullYear(),
      leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const divisor = BigInt(leap ? 366 : 365) * 1000000n;
    accrual += (balance > 0n ? balance : 0n) * BigInt(units);
    const last = new Date(
      Date.UTC(year, date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    if (a.interest_frequency === "daily" || date.getUTCDate() === last) {
      const cents = (accrual + divisor / 2n) / divisor;
      accrual = 0n;
      if (cents) {
        const n = Number(cents);
        if (!Number.isSafeInteger(n))
          throw new Error("Слишком большая сумма процентов");
        balance += cents;
        out.push({
          id: `interest-${a.id}-${d}`,
          account_id: a.id,
          household_id: list[0]?.household_id ?? "local-family",
          kind: "interest",
          amount: decimal(n),
          occurred_on: d,
          comment: "Автоматическое начисление процентов",
          user_id: "system",
          updated_by: "system",
          version: 0,
        });
      }
    }
  }
  return out;
}
