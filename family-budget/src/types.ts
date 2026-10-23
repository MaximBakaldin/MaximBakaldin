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
  goal_id?: string | null;
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
export type MonthlyBudget = {
  household_id: string;
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
  monthly_budget?: MonthlyBudget | null;
  goals?: FinancialGoal[];
  cards?: CardBalance;
  transfers?: AccountTransfer[];
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
  goal_id?: string | null;
  id: string;
  category_id: string;
  kind: Kind;
  amount: string;
  occurred_on: string;
  comment: string;
  version: number;
};
export type HistoryFilter = {
  category: string;
  search: string;
  range?: { from: string; to: string };
};
export type JournalEntry =
  | (Transaction & { source: "transaction" })
  | (SavingsEntry & { source: "savings"; account_name: string });

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
  goal_id?: string | null;
  transfer_id?: string | null;
  account_id?: string;
  id: string;
  household_id: string;
  kind: SavingsKind | "interest";
  amount: string | number;
  occurred_on: string;
  comment: string | null;
  user_id: string;
  updated_by: string;
  version: number;
};
export type Savings = {
  accounts?: SavingsAccountData[];
  balance_cents: string;
  transfer_cents: string;
  has_opening: boolean;
  entries: SavingsEntry[];
};
export type SavingsDraft = {
  account_id?: string;
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

export type SavingsAccountData = {
  goal_id?: string | null;
  annual_rate?: string | number | null;
  interest_start?: string | null;
  interest_frequency?: "daily" | "monthly";
  interest_cents?: string;
  id: string;
  name: string;
  version: number;
  is_default: boolean;
  balance_cents: string;
  transfer_cents: string;
  has_opening: boolean;
};

export type GoalBaseline = {
  captured_on: string;
  target_amount: string | number;
  deadline: string;
  monthly_amount: string | number;
  required_amount: string | number;
  balance_amount: string | number;
};
export type FinancialGoal = {
  id: string;
  household_id: string;
  name: string;
  target_amount: string | number;
  deadline: string;
  monthly_amount: string | number;
  version: number;
  archived: boolean;
  baseline?: GoalBaseline | null;
  paid_cents?: string;
  contribution_cents?: string;
  paid_month_cents?: string;
};
export type CardBalance = {
  opening_amount: string | number | null;
  opening_on: string | null;
  version: number;
  balance_cents: string | null;
};
export type AccountTransfer = {
  id: string;
  household_id: string;
  version: number;
  from_account: string;
  to_account: string;
  amount: string | number;
  occurred_on: string;
  comment: string | null;
  debit_id?: string;
  credit_id?: string;
};
