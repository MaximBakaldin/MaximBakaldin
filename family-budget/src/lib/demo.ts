import type { AnalysisRow, DateRange } from "./analysis";
import type {
  FinancialGoal,
  CardBalance,
  AccountTransfer,
  GoalBaseline,
  JournalEntry,
} from "../types";
import type { CategoryUsage } from "./categories";
import {
  calculatedSavings,
  validateInterest,
  type InterestSettings,
} from "./interest";
import type {
  Budget,
  Family,
  Recurring,
  RecurringDraft,
  SavingsEntry,
  SavingsDraft,
  Category,
  Draft,
  HistoryFilter,
  Snapshot,
  Transaction,
} from "../types";
import { validateGoal } from "./goals";
import { today, shiftMonth, validDate } from "./dates";
import { decimal, parseMoney, total } from "./money";
const KEY = "family-budget.local.v2";
type Store = {
  goals?: FinancialGoal[];
  goalVersions?: { on: string; value: FinancialGoal }[];
  links?: { account: string; goal: string | null; on: string }[];
  cards?: CardBalance;
  transfers?: AccountTransfer[];
  transactions: Transaction[];
  budgets: Budget[];
  revision: number;
  family?: Family;
  categories?: Category[];
  recurring?: (RecurringDraft & { month: string })[];
  savings?: SavingsEntry[];
  accounts?: ({
    id: string;
    name: string;
    version: number;
    is_default: boolean;
  } & InterestSettings)[];
};
export const DEMO_USER = "local-user";
const family: Family = {
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
function normalizeAccounts(s: Store): Store {
  s.accounts ??= [
    { id: "local-savings", name: "Накопления", version: 1, is_default: true },
  ];
  s.savings = (s.savings ?? []).map((e) => ({
    ...e,
    account_id: e.account_id ?? s.accounts![0].id,
  }));
  return s;
}
function read(): Store {
  const raw = localStorage.getItem(KEY);
  if (!raw)
    return normalizeAccounts({ transactions: [], budgets: [], revision: 0 });
  try {
    const data: Store = JSON.parse(raw);
    if (
      !Array.isArray(data.transactions) ||
      !Array.isArray(data.budgets) ||
      !Number.isSafeInteger(data.revision)
    )
      throw new Error();
    return normalizeAccounts(data);
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
  const rawSavings = s.savings ?? [];
  const end = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  s.savings = (s.accounts ?? []).flatMap((a) =>
    calculatedSavings(rawSavings, a, end),
  );
  const goalList = (s.goals ?? []).flatMap((g) => {
    const version = (s.goalVersions ?? [])
      .filter((v) => v.value.id === g.id && v.on <= end)
      .at(-1)?.value;
    if (!version) return [];
    return [
      {
        ...version,
        baseline: g.baseline,
        paid_cents: String(
          total(
            s.transactions
              .filter((t) => t.goal_id === g.id && t.occurred_on <= end)
              .map((t) => parseMoney(t.amount)),
          ),
        ),
        paid_month_cents: String(
          total(
            s.transactions
              .filter(
                (t) => t.goal_id === g.id && t.occurred_on.startsWith(month),
              )
              .map((t) => parseMoney(t.amount)),
          ),
        ),
        contribution_cents: String(
          total(
            (s.savings ?? [])
              .filter((e) => {
                if (e.kind === "opening" || !e.occurred_on.startsWith(month))
                  return false;
                const goal =
                  e.kind === "interest"
                    ? (s.links ?? [])
                        .filter(
                          (l) =>
                            l.account === e.account_id && l.on <= e.occurred_on,
                        )
                        .at(-1)?.goal
                    : e.goal_id;
                return goal === g.id;
              })
              .map(
                (e) =>
                  parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
              ),
          ),
        ),
      },
    ];
  });
  const cards = s.cards ?? {
    opening_amount: null,
    opening_on: null,
    version: 0,
    balance_cents: null,
  };
  const cardCents =
    cards.opening_on && cards.opening_on <= end
      ? total([
          parseMoney(cards.opening_amount!, true),
          ...s.transactions
            .filter(
              (t) => t.occurred_on >= cards.opening_on! && t.occurred_on <= end,
            )
            .map((t) => parseMoney(t.amount) * (t.kind === "income" ? 1 : -1)),
          ...rawSavings
            .filter(
              (e) =>
                !e.transfer_id &&
                ["deposit", "withdrawal"].includes(e.kind) &&
                e.occurred_on >= cards.opening_on! &&
                e.occurred_on <= end,
            )
            .map(
              (e) => parseMoney(e.amount) * (e.kind === "withdrawal" ? 1 : -1),
            ),
        ])
      : null;
  return {
    goals: goalList,
    cards: {
      ...cards,
      balance_cents: cardCents === null ? null : String(cardCents),
    },
    transfers: s.transfers ?? [],
    family: s.family ?? family,
    revision: s.revision,
    categories: s.categories ?? categories,
    members: [
      { household_id: family.id, user_id: DEMO_USER, display_name: "Вы" },
    ],
    recurring: Array.from(
      new Set((s.recurring ?? []).map((r) => r.id)),
    ).flatMap((id) => {
      const rule = (s.recurring ?? [])
        .filter((r) => r.id === id && r.month <= month)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      if (!rule) return [];
      const version = Math.max(
        ...(s.recurring ?? []).filter((r) => r.id === id).map((r) => r.version),
      );
      return [
        {
          ...rule,
          version,
          effective_month: rule.month + "-01",
          payment:
            s.transactions.find(
              (t) =>
                t.recurring_id === id && t.recurring_month === month + "-01",
            ) ?? null,
        },
      ];
    }),
    savings: {
      accounts: (s.accounts ?? []).map((a) => ({
        ...a,
        goal_id:
          (s.links ?? [])
            .filter((l) => l.account === a.id && l.on <= end)
            .at(-1)?.goal ?? null,
        interest_cents: String(
          total(
            (s.savings ?? [])
              .filter(
                (e) =>
                  e.account_id === a.id &&
                  e.kind === "interest" &&
                  e.occurred_on.startsWith(month),
              )
              .map((e) => parseMoney(e.amount)),
          ),
        ),
        balance_cents: String(
          total(
            (s.savings ?? [])
              .filter(
                (e) =>
                  e.account_id === a.id && e.occurred_on.slice(0, 7) <= month,
              )
              .map(
                (e) =>
                  parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
              ),
          ),
        ),
        transfer_cents: String(
          total(
            (s.savings ?? [])
              .filter(
                (e) =>
                  e.account_id === a.id &&
                  e.occurred_on.startsWith(month) &&
                  e.kind !== "opening" &&
                  e.kind !== "interest",
              )
              .map(
                (e) =>
                  parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
              ),
          ),
        ),
        has_opening: rawSavings.some(
          (e) => e.account_id === a.id && e.kind === "opening",
        ),
      })),
      balance_cents: String(
        total(
          (s.savings ?? [])
            .filter((e) => e.occurred_on.slice(0, 7) <= month)
            .map(
              (e) => parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
            ),
        ),
      ),
      transfer_cents: String(
        total(
          (s.savings ?? [])
            .filter(
              (e) =>
                e.occurred_on.startsWith(month) &&
                e.kind !== "opening" &&
                e.kind !== "interest",
            )
            .map(
              (e) => parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
            ),
        ),
      ),
      has_opening: rawSavings.some((e) => e.kind === "opening"),
      entries: (s.savings ?? [])
        .filter((e) => e.occurred_on.startsWith(month))
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
    },
    budgets: s.budgets.filter((b) => b.month === month + "-01"),
    summary: (s.categories ?? categories).map((c) => ({
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
    goal_id: draft.kind === "expense" ? (draft.goal_id ?? null) : null,
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
    !(s.categories ?? categories).some(
      (c) =>
        c.id === draft.category_id &&
        c.kind === draft.kind &&
        (!c.archived || old?.category_id === c.id),
    )
  )
    throw new Error("Выберите категорию");
  if (
    old?.recurring_id &&
    (draft.kind !== "expense" ||
      draft.occurred_on.slice(0, 7) !== old.recurring_month?.slice(0, 7))
  )
    throw new Error(
      "Оплата обязательного платежа должна остаться расходом в своём месяце",
    );
  if (
    data.goal_id &&
    !(s.goals ?? []).some(
      (g) => g.id === data.goal_id && (!g.archived || old?.goal_id === g.id),
    )
  )
    throw new Error("Цель недоступна");
  const row: Transaction = {
    recurring_id: old?.recurring_id,
    recurring_month: old?.recurring_month,
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

export function localRename(name: string, version: number) {
  const s = read();
  const f = s.family ?? family;
  if ((f.settings_version ?? 1) !== version)
    throw new Error("Название уже изменено");
  if (!name.trim() || name.trim().length > 80)
    throw new Error("Проверьте название");
  s.family = { ...f, name: name.trim(), settings_version: version + 1 };
  write(s);
}
export function localCategory(c: Category) {
  const s = read();
  const list = s.categories ?? categories;
  const old = list.find((x) => x.id === c.id);
  if ((old?.version ?? (old ? 1 : 0)) !== c.version)
    throw new Error("Категория уже изменена");
  if (!c.name.trim()) throw new Error("Введите название");
  if (
    !c.archived &&
    list.some(
      (x) =>
        x.id !== c.id &&
        !x.archived &&
        x.kind === c.kind &&
        x.name.toLowerCase() === c.name.trim().toLowerCase(),
    )
  )
    throw new Error("Такая категория уже есть");
  if (
    c.archived &&
    localSnapshot("9998-12").recurring?.some(
      (r) => r.category_id === c.id && r.active,
    )
  )
    throw new Error(
      "Сначала выберите другую категорию в обязательных платежах",
    );
  s.categories = [
    ...list.filter((x) => x.id !== c.id),
    { ...c, name: c.name.trim(), version: (c.version ?? 0) + 1 },
  ];
  write(s);
}
export function localRecurring(d: RecurringDraft, month: string) {
  const s = read();
  const list = s.recurring ?? [];
  const version = Math.max(
    0,
    ...list.filter((r) => r.id === d.id).map((r) => r.version),
  );
  if (version !== d.version) throw new Error("Платёж уже изменён");
  parseMoney(d.amount);
  s.recurring = [
    ...list.filter((r) => r.id !== d.id || r.month !== month),
    { ...d, version: version + 1, month },
  ];
  write(s);
}
export function localPay(r: Recurring, month: string, date: string) {
  const s = read();
  if (
    s.transactions.some(
      (t) => t.recurring_id === r.id && t.recurring_month === month + "-01",
    )
  )
    return;
  const current = localSnapshot(month).recurring?.find((x) => x.id === r.id);
  if (!current?.active || current.version !== r.version)
    throw new Error("Платёж уже изменён");
  if (!date.startsWith(month)) throw new Error("Выберите дату в этом месяце");
  const now = new Date().toISOString();
  s.transactions.push({
    id: crypto.randomUUID(),
    household_id: family.id,
    user_id: DEMO_USER,
    updated_by: DEMO_USER,
    version: 1,
    created_at: now,
    updated_at: now,
    category_id: r.category_id,
    kind: "expense",
    amount: decimal(parseMoney(r.amount)),
    occurred_on: date,
    comment: r.name,
    recurring_id: r.id,
    recurring_month: month + "-01",
  });
  write(s);
}
export function localSavings(d: SavingsDraft, remove = false) {
  const s = read();
  const list = s.savings ?? [];
  const old = list.find((e) => e.id === d.id);
  if ((old?.version ?? 0) !== d.version) throw new Error("Перевод уже изменён");
  const account = d.account_id ?? old?.account_id ?? s.accounts![0].id;
  if (!s.accounts!.some((a) => a.id === account))
    throw new Error("Счёт не найден");
  if (old?.transfer_id)
    throw new Error("Измените перевод между счетами целиком");
  const next = list.filter((e) => e.id !== d.id);
  if (!remove) {
    if (
      d.kind === "opening" &&
      next.some((e) => e.kind === "opening" && e.account_id === account)
    )
      throw new Error("Начальный остаток уже задан");
    next.push({
      ...d,
      account_id: account,
      goal_id:
        old && old.account_id === account && old.occurred_on === d.occurred_on
          ? old.goal_id
          : ((s.links ?? [])
              .filter((l) => l.account === account && l.on <= d.occurred_on)
              .at(-1)?.goal ?? null),
      amount: decimal(parseMoney(d.amount)),
      household_id: family.id,
      user_id: old?.user_id ?? DEMO_USER,
      updated_by: DEMO_USER,
      version: d.version + 1,
    });
  }
  for (const a of s.accounts!) {
    const entries = calculatedSavings(next, a, "9998-12-31");
    const days = Array.from(new Set(entries.map((e) => e.occurred_on))).sort();
    let balance = 0;
    for (const date of days) {
      balance += total(
        entries
          .filter((e) => e.occurred_on === date)
          .map(
            (e) => parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
          ),
      );
      if (balance < 0)
        throw new Error(
          "На накопительном счёте недостаточно средств на эту дату",
        );
    }
  }
  s.savings = next;
  write(s);
}

export function localSavingsAccount(
  id: string,
  name: string,
  version: number,
  settings?: InterestSettings,
  goalId?: string | null,
) {
  const s = read();
  const old = s.accounts!.find((a) => a.id === id);
  if ((old?.version ?? 0) !== version) throw new Error("Счёт уже изменён");
  if (!name.trim() || name.trim().length > 60)
    throw new Error("Проверьте название счёта");
  if (
    s.accounts!.some(
      (a) => a.id !== id && a.name.toLowerCase() === name.trim().toLowerCase(),
    )
  )
    throw new Error("Счёт с таким названием уже есть");
  if (goalId && !(s.goals ?? []).some((g) => g.id === goalId && !g.archived))
    throw new Error("Цель недоступна");
  const interest = settings ?? old ?? {};
  validateInterest(interest);
  const projected = calculatedSavings(
    s.savings ?? [],
    { ...interest, id },
    "9998-12-31",
  );
  let balance = 0;
  for (const day of [...new Set(projected.map((e) => e.occurred_on))].sort()) {
    balance += total(
      projected
        .filter((e) => e.occurred_on === day)
        .map((e) => parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1)),
    );
    if (balance < 0)
      throw new Error("Изменение процентов оставит отрицательный остаток");
  }
  s.accounts = [
    ...s.accounts!.filter((a) => a.id !== id),
    {
      id,
      name: name.trim(),
      version: version + 1,
      is_default: old?.is_default ?? false,
      annual_rate: interest.annual_rate ?? null,
      interest_start: interest.interest_start ?? null,
      interest_frequency: interest.interest_frequency ?? "monthly",
    },
  ];
  if (
    goalId !== undefined &&
    (s.links ?? []).filter((l) => l.account === id).at(-1)?.goal !== goalId
  ) {
    s.links = [...(s.links ?? []), { account: id, goal: goalId, on: today() }];
  }
  write(s);
}

export function localCategoryUsage(): CategoryUsage[] {
  const counts = new Map<string, number>();
  for (const t of read().transactions)
    counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
  return Array.from(counts, ([category_id, uses]) => ({ category_id, uses }));
}

export function localAnalysis(
  range: DateRange | null,
  daily: boolean,
): AnalysisRow[] {
  const sums = new Map<string, AnalysisRow>();
  for (const t of read().transactions) {
    if (range && (t.occurred_on < range.from || t.occurred_on > range.to))
      continue;
    const period = daily ? t.occurred_on : t.occurred_on.slice(0, 7) + "-01",
      key = period + ":" + t.category_id;
    const old = sums.get(key);
    sums.set(key, {
      period,
      category_id: t.category_id,
      kind: t.kind,
      cents: String(total([Number(old?.cents ?? 0), parseMoney(t.amount)])),
    });
  }
  return [...sums.values()].sort((a, b) => a.period.localeCompare(b.period));
}
export function localJournal(
  month: string,
  filter: HistoryFilter,
  offset: number,
) {
  const s = read();
  const rows: JournalEntry[] = [
    ...s.transactions.map((t) => ({ ...t, source: "transaction" as const })),
    ...(s.savings ?? []).map((e) => ({
      ...e,
      source: "savings" as const,
      account_name:
        s.accounts?.find((a) => a.id === e.account_id)?.name ?? "Накопления",
    })),
  ];
  const filtered = rows
    .filter(
      (e) =>
        (filter.range
          ? e.occurred_on >= filter.range.from &&
            e.occurred_on <= filter.range.to
          : e.occurred_on.startsWith(month)) &&
        (!filter.category ||
          (e.source === "transaction" && e.category_id === filter.category)) &&
        (!filter.search.trim() ||
          (e.comment ?? "")
            .toLocaleLowerCase()
            .includes(filter.search.trim().toLocaleLowerCase())),
    )
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) ||
        b.id.localeCompare(a.id) ||
        b.source.localeCompare(a.source),
    );
  return { rows: filtered.slice(offset, offset + 30), count: filtered.length };
}

export function localGoal(g: FinancialGoal) {
  validateGoal(g);
  const s = read(),
    old = s.goals?.find((x) => x.id === g.id);
  if ((old?.version ?? 0) !== g.version)
    throw new Error("Цель уже изменена. Обновите данные");
  const next = {
    ...g,
    name: g.name.trim(),
    version: g.version + 1,
    baseline: old?.baseline ?? null,
  };
  s.goals = [...(s.goals ?? []).filter((x) => x.id !== g.id), next];
  s.goalVersions = [...(s.goalVersions ?? []), { on: today(), value: next }];
  if (g.archived && !old?.archived)
    for (const a of s.accounts!) {
      if (s.links?.filter((l) => l.account === a.id).at(-1)?.goal === g.id)
        s.links.push({ account: a.id, goal: null, on: today() });
      a.version++;
    }
  write(s);
}
export function localCardSettings(
  amount: string,
  date: string,
  version: number,
) {
  const s = read();
  if ((s.cards?.version ?? 0) !== version)
    throw new Error("Остаток уже изменён. Обновите данные");
  if (!validDate(date)) throw new Error("Проверьте дату");
  s.cards = {
    opening_amount: decimal(parseMoney(amount, true)),
    opening_on: date,
    version: version + 1,
    balance_cents: null,
  };
  write(s);
}
export function localBaseline(g: FinancialGoal, baseline: GoalBaseline) {
  const s = read(),
    old = s.goals?.find((x) => x.id === g.id);
  if (!old || old.version !== g.version) throw new Error("Цель уже изменена");
  if (old.baseline) return;
  old.baseline = baseline;
  old.version++;
  s.goalVersions = [
    ...(s.goalVersions ?? []),
    { on: today(), value: { ...old } },
  ];
  write(s);
}
export function localAccountTransfer(t: AccountTransfer, remove = false) {
  const s = read(),
    old = s.transfers?.find((x) => x.id === t.id);
  if ((old?.version ?? 0) !== t.version) throw new Error("Перевод уже изменён");
  if (
    t.from_account === t.to_account ||
    !s.accounts!.some((a) => a.id === t.from_account) ||
    !s.accounts!.some((a) => a.id === t.to_account)
  )
    throw new Error("Выберите разные счета");
  if (!validDate(t.occurred_on)) throw new Error("Проверьте дату");
  const next = {
    ...t,
    amount: decimal(parseMoney(t.amount)),
    version: t.version + 1,
    debit_id: old?.debit_id ?? crypto.randomUUID(),
    credit_id: old?.credit_id ?? crypto.randomUUID(),
  };
  s.savings = (s.savings ?? []).filter((e) => e.transfer_id !== t.id);
  if (!remove)
    for (const [id, account, kind] of [
      [next.debit_id, t.from_account, "withdrawal"],
      [next.credit_id, t.to_account, "deposit"],
    ] as const)
      s.savings.push({
        id,
        account_id: account,
        household_id: family.id,
        kind,
        amount: next.amount,
        occurred_on: t.occurred_on,
        comment: t.comment,
        user_id: DEMO_USER,
        updated_by: DEMO_USER,
        version: next.version,
        transfer_id: t.id,
        goal_id:
          (s.links ?? [])
            .filter((l) => l.account === account && l.on <= t.occurred_on)
            .at(-1)?.goal ?? null,
      });
  for (const a of s.accounts!) {
    const es = calculatedSavings(s.savings, a, "9998-12-31");
    let b = 0;
    for (const day of [...new Set(es.map((e) => e.occurred_on))].sort()) {
      b += total(
        es
          .filter((e) => e.occurred_on === day)
          .map(
            (e) => parseMoney(e.amount) * (e.kind === "withdrawal" ? -1 : 1),
          ),
      );
      if (b < 0)
        throw new Error(
          "На накопительном счёте недостаточно средств на эту дату",
        );
    }
  }
  s.transfers = [
    ...(s.transfers ?? []).filter((x) => x.id !== t.id),
    ...(remove ? [] : [next]),
  ];
  write(s);
}
