export type Kind = "expense" | "income";
export type Category = {
  id: string;
  household_id: string;
  name: string;
  kind: Kind;
  essential: boolean;
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
  version: number;
};
export type Budget = {
  household_id: string;
  category_id: string;
  month: string;
  amount: string | number;
  version: number;
};
export type Family = { id: string; name: string; created_by: string };
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
