export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const currentMonth = () => today().slice(0, 7);
export function validMonth(month: string): boolean {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    Number(month.slice(0, 4)) >= 1900 &&
    Number(month.slice(0, 4)) <= 9998
  );
}
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    validMonth(date.slice(0, 7)) &&
    Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function shiftMonth(month: string, by: number): string {
  if (!validMonth(month)) throw new Error("Выберите месяц");
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}
export function monthBounds(month: string) {
  if (!validMonth(month)) throw new Error("Выберите месяц");
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` };
}
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
