export type Kind = "expense" | "income";
export type Category = {
  id: string;
  household_id: string;
  name: string;
  kind: Kind;
  essential: boolean;
  archived?: boolean;
  version?: number;
};
export type Transaction = {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string;
  kind: Kind;
  amount: string | number;
  occurred_on: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
  recurring_id?: string | null;
  recurring_month?: string | null;
  version: number;
};
export type Budget = {
  household_id: string;
  category_id: string;
  month: string;
  amount: string | number;
  version: number;
};
export type Family = {
  id: string;
  name: string;
  created_by: string;
  settings_version?: number;
};
export type Member = {
  user_id: string;
  household_id: string;
  display_name: string;
};
export type Summary = { category_id: string; kind: Kind; cents: string };
export type Snapshot = {
  family: Family;
  categories: Category[];
  budgets: Budget[];
  summary: Summary[];
  members: Member[];
  revision: number;
  recurring?: Recurring[];
  savings?: Savings;
};
export type Draft = {
  id: string;
  category_id: string;
  kind: Kind;
  amount: string;
  occurred_on: string;
  comment: string;
  version: number;
};
export type HistoryFilter = { category: string; search: string };

export type Recurring = {
  id: string;
  version: number;
  name: string;
  category_id: string;
  amount: string | number;
  due_day: number;
  active: boolean;
  effective_month: string;
  payment: Transaction | null;
};
export type RecurringDraft = Omit<Recurring, "payment" | "effective_month">;
export type SavingsKind = "opening" | "deposit" | "withdrawal";
export type SavingsEntry = {
  id: string;
  household_id: string;
  kind: SavingsKind;
  amount: string | number;
  occurred_on: string;
  comment: string | null;
  user_id: string;
  updated_by: string;
  version: number;
};
export type Savings = {
  balance_cents: string;
  transfer_cents: string;
  has_opening: boolean;
  entries: SavingsEntry[];
};
export type SavingsDraft = {
  id: string;
  version: number;
  kind: SavingsKind;
  amount: string;
  occurred_on: string;
  comment: string;
};
export type Run = (
  action: () => Promise<void> | void,
  success?: string,
) => Promise<boolean>;
