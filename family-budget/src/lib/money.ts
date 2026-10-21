const MAX_CENTS = 99_999_999_999_999;
export function parseMoney(value: string | number, allowZero = false): number {
  const raw = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error("Введите сумму с точностью до копеек");
  const [rubles, fraction = ""] = raw.split(".");
  const cents = Number(rubles) * 100 + Number(fraction.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(cents) ||
    cents > MAX_CENTS ||
    cents < (allowZero ? 0 : 1)
  ) {
    throw new Error(
      allowZero
        ? "Сумма должна быть от 0 до 999 999 999 999,99 ₽"
        : "Укажите положительную сумму не больше 999 999 999 999,99 ₽",
    );
  }
  return cents;
}
export function decimal(cents: number): string {
  if (!Number.isSafeInteger(cents))
    throw new Error("Сумма превышает точность расчёта");
  return `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
}
export function total(values: number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result))
    throw new Error("Сумма превышает точность расчёта");
  return result;
}
export function summaryCents(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Некорректная сумма от сервера");
  return n;
}
export const currency = (cents: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
