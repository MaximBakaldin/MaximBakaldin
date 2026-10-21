import type {
  Budget,
  Category,
  Draft,
  HistoryFilter,
  Snapshot,
  Transaction,
} from "../types";
import { today, shiftMonth } from "./dates";
import { decimal, parseMoney, total } from "./money";
const KEY = "family-budget.local.v2";
type Store = {
  transactions: Transaction[];
  budgets: Budget[];
  revision: number;
};
export const DEMO_USER = "local-user";
const family = {
  id: "local-family",
  name: "Мой бюджет",
  created_by: DEMO_USER,
};
const names = [
  "Продукты",
  "Дети",
  "Дом и ЖКХ",
  "Транспорт",
  "Здоровье",
  "Досуг",
  "Прочее",
  "Зарплата",
  "Другие доходы",
];
const categories: Category[] = names.map((name, i) => ({
  id: `local-${i}`,
  household_id: family.id,
  name,
  kind: i < 7 ? "expense" : "income",
  essential: i < 5,
}));
function read(): Store {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { transactions: [], budgets: [], revision: 0 };
  try {
    const data: Store = JSON.parse(raw);
    if (
      !Array.isArray(data.transactions) ||
      !Array.isArray(data.budgets) ||
      !Number.isSafeInteger(data.revision)
    )
      throw new Error();
    return data;
  } catch {
    throw new Error(
      "Локальные данные повреждены. Сохраните содержимое браузера перед восстановлением",
    );
  }
}
function write(store: Store) {
  store.revision++;
  localStorage.setItem(KEY, JSON.stringify(store));
}
export function localSnapshot(month: string): Snapshot {
  const s = read();
  return {
    family,
    revision: s.revision,
    categories,
    members: [
      { household_id: family.id, user_id: DEMO_USER, display_name: "Вы" },
    ],
    budgets: s.budgets.filter((b) => b.month === month + "-01"),
    summary: categories.map((c) => ({
      category_id: c.id,
      kind: c.kind,
      cents: String(
        total(
          s.transactions
            .filter(
              (t) => t.category_id === c.id && t.occurred_on.startsWith(month),
            )
            .map((t) => parseMoney(t.amount)),
        ),
      ),
    })),
  };
}
export function localHistory(
  month: string,
  filter: HistoryFilter,
  offset: number,
  limit = 30,
) {
  const rows = read()
    .transactions.filter(
      (t) =>
        t.occurred_on.startsWith(month) &&
        (!filter.category || t.category_id === filter.category) &&
        (!filter.search ||
          (t.comment ?? "")
            .toLocaleLowerCase()
            .includes(filter.search.trim().toLocaleLowerCase())),
    )
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id),
    );
  return { rows: rows.slice(offset, offset + limit), count: rows.length };
}
export function localSave(draft: Draft) {
  const s = read();
  const old = s.transactions.find((t) => t.id === draft.id);
  const data = {
    category_id: draft.category_id,
    kind: draft.kind,
    amount: decimal(parseMoney(draft.amount)),
    occurred_on: draft.occurred_on,
    comment: draft.comment.trim() || null,
  };
  if (
    old &&
    draft.version === 0 &&
    Object.entries(data).every(([k, v]) => old[k as keyof Transaction] === v)
  )
    return;
  if ((old?.version ?? 0) !== draft.version)
    throw new Error("Операция уже изменена. Обновите данные");
  if (
    !categories.some((c) => c.id === draft.category_id && c.kind === draft.kind)
  )
    throw new Error("Выберите категорию");
  const row: Transaction = {
    ...data,
    id: draft.id,
    household_id: family.id,
    user_id: old?.user_id ?? DEMO_USER,
    created_at: old?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: DEMO_USER,
    version: (old?.version ?? 0) + 1,
  };
  s.transactions = [...s.transactions.filter((t) => t.id !== row.id), row];
  write(s);
}
export function localDelete(t: Transaction) {
  const s = read();
  const row = s.transactions.find((r) => r.id === t.id);
  if (row && row.version !== t.version)
    throw new Error("Операция уже изменена. Обновите данные");
  s.transactions = s.transactions.filter((r) => r.id !== t.id);
  write(s);
}
export function localBudget(
  category: string,
  month: string,
  amount: string,
  version: number,
) {
  const s = read();
  const old = s.budgets.find(
    (b) => b.category_id === category && b.month === month + "-01",
  );
  if ((old?.version ?? 0) !== version)
    throw new Error("План уже изменён. Обновите данные");
  s.budgets = [
    ...s.budgets.filter((b) => b !== old),
    {
      household_id: family.id,
      category_id: category,
      month: month + "-01",
      amount: decimal(parseMoney(amount, true)),
      version: version + 1,
    },
  ];
  write(s);
}
export function localCopy(month: string) {
  const s = read();
  const prev = s.budgets.filter(
    (b) => b.month === shiftMonth(month, -1) + "-01",
  );
  let count = 0;
  for (const b of prev)
    if (
      !s.budgets.some(
        (other) =>
          other.month === month + "-01" && other.category_id === b.category_id,
      )
    ) {
      s.budgets.push({ ...b, month: month + "-01", version: 1 });
      count++;
    }
  write(s);
  return count;
}
export function newDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    version: 0,
    amount: "",
    category_id: "",
    kind: "expense",
    comment: "",
    occurred_on: today(),
  };
}
