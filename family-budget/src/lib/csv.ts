import type { Category, Transaction } from "../types";
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Control characters can hide spreadsheet formulas.
  // eslint-disable-next-line no-control-regex
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function transactionsCsv(rows: Transaction[], cats: Category[]): string {
  const header = [
    "id",
    "date",
    "type",
    "amount",
    "category",
    "author_id",
    "comment",
    "created_at",
    "updated_at",
    "updated_by",
  ];
  return (
    "\ufeff" +
    [
      header,
      ...rows.map((t) => [
        t.id,
        t.occurred_on,
        t.kind,
        t.amount,
        cats.find((c) => c.id === t.category_id)?.name ?? t.category_id,
        t.user_id,
        t.comment,
        t.created_at,
        t.updated_at,
        t.updated_by,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function downloadFile(content: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
